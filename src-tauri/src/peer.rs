use std::sync::atomic::{AtomicU16, AtomicU32, Ordering};
use std::sync::Arc;

use anyhow::{Context, Result};
use webrtc::api::interceptor_registry::register_default_interceptors;
use webrtc::api::media_engine::{MediaEngine, MIME_TYPE_OPUS};
use webrtc::api::APIBuilder;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::interceptor::registry::Registry;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::peer_connection::RTCPeerConnection;
use webrtc::rtp_transceiver::rtp_codec::RTCRtpCodecCapability;
use webrtc::track::track_local::track_local_static_rtp::TrackLocalStaticRTP;
use webrtc::track::track_local::{TrackLocal, TrackLocalWriter};

use crate::types::{DecodedFrame, EncodedFrame, SignalPayload, CHANNELS, FRAME_SIZE, SAMPLE_RATE};

pub struct PeerConn {
    pub peer_id: String,
    pub connection: Arc<RTCPeerConnection>,
    pub audio_track: Arc<TrackLocalStaticRTP>,
    pub decoded_rx: flume::Receiver<DecodedFrame>,
    rtp_seq: AtomicU16,
    rtp_ts: AtomicU32,
    rtp_ssrc: u32,
}

impl PeerConn {
    pub async fn new(
        peer_id: String,
        on_ice_candidate: flume::Sender<(String, SignalPayload)>,
    ) -> Result<Self> {
        // Set up media engine with Opus
        let mut media_engine = MediaEngine::default();
        media_engine.register_default_codecs()?;

        // Interceptors for RTCP etc.
        let mut registry = Registry::new();
        registry = register_default_interceptors(registry, &mut media_engine)?;

        let api = APIBuilder::new()
            .with_media_engine(media_engine)
            .with_interceptor_registry(registry)
            .build();

        let config = RTCConfiguration {
            ice_servers: vec![
                RTCIceServer {
                    urls: vec!["stun:stun.l.google.com:19302".to_string()],
                    ..Default::default()
                },
                RTCIceServer {
                    urls: vec!["stun:stun1.l.google.com:19302".to_string()],
                    ..Default::default()
                },
            ],
            ..Default::default()
        };

        let connection = Arc::new(api.new_peer_connection(config).await?);

        // Create local audio track
        let audio_track = Arc::new(TrackLocalStaticRTP::new(
            RTCRtpCodecCapability {
                mime_type: MIME_TYPE_OPUS.to_string(),
                clock_rate: SAMPLE_RATE,
                channels: CHANNELS,
                ..Default::default()
            },
            "audio".to_string(),
            "entavi-audio".to_string(),
        ));

        // Add the track to the peer connection
        connection
            .add_track(Arc::clone(&audio_track) as Arc<dyn TrackLocal + Send + Sync>)
            .await?;

        // Channel for decoded audio from this remote peer
        let (decoded_tx, decoded_rx) = flume::unbounded::<DecodedFrame>();

        // ICE candidate callback
        let pid = peer_id.clone();
        let ice_tx = on_ice_candidate.clone();
        connection.on_ice_candidate(Box::new(move |candidate| {
            let pid = pid.clone();
            let ice_tx = ice_tx.clone();
            Box::pin(async move {
                if let Some(c) = candidate {
                    let json = match c.to_json() {
                        Ok(j) => j,
                        Err(e) => {
                            tracing::warn!("Failed to serialize ICE candidate: {e}");
                            return;
                        }
                    };
                    let payload = SignalPayload::IceCandidate {
                        candidate: json.candidate,
                        sdp_mid: json.sdp_mid,
                        sdp_mline_index: json.sdp_mline_index,
                    };
                    let _ = ice_tx.send((pid, payload));
                }
            })
        }));

        // Connection state logging
        let pid_log = peer_id.clone();
        connection.on_peer_connection_state_change(Box::new(move |state| {
            tracing::info!("Peer {pid_log} connection state: {state}");
            if state == RTCPeerConnectionState::Failed
                || state == RTCPeerConnectionState::Disconnected
                || state == RTCPeerConnectionState::Closed
            {
                tracing::warn!("Peer {pid_log} connection lost");
            }
            Box::pin(async {})
        }));

        // On incoming track: decode opus → send decoded PCM to engine
        let remote_pid = peer_id.clone();
        connection.on_track(Box::new(move |track, _receiver, _transceiver| {
            let decoded_tx = decoded_tx.clone();
            let remote_pid = remote_pid.clone();

            Box::pin(async move {
                tracing::info!("Received remote audio track from {remote_pid}");

                // Spawn a task to read RTP packets and decode opus
                tokio::spawn(async move {
                    let mut decoder = match opus::Decoder::new(SAMPLE_RATE, opus::Channels::Mono) {
                        Ok(d) => d,
                        Err(e) => {
                            tracing::error!("Failed to create opus decoder: {e}");
                            return;
                        }
                    };

                    let mut pcm_buf = vec![0.0f32; FRAME_SIZE];

                    loop {
                        match track.read_rtp().await {
                            Ok((rtp_packet, _)) => {
                                let payload = &rtp_packet.payload;
                                if payload.is_empty() {
                                    continue;
                                }

                                match decoder.decode_float(payload, &mut pcm_buf, false) {
                                    Ok(samples) => {
                                        let frame = DecodedFrame {
                                            samples: pcm_buf[..samples].to_vec(),
                                        };
                                        if decoded_tx.send(frame).is_err() {
                                            break; // engine dropped
                                        }
                                    }
                                    Err(e) => {
                                        tracing::warn!("Opus decode error: {e}");
                                    }
                                }
                            }
                            Err(e) => {
                                tracing::warn!("RTP read error for {remote_pid}: {e}");
                                break;
                            }
                        }
                    }
                });
            })
        }));

        let rtp_ssrc: u32 = rand::random();

        Ok(Self {
            peer_id,
            connection,
            audio_track,
            decoded_rx,
            rtp_seq: AtomicU16::new(0),
            rtp_ts: AtomicU32::new(0),
            rtp_ssrc,
        })
    }

    /// Create an SDP offer (we are the caller)
    pub async fn create_offer(&self) -> Result<String> {
        let offer = self.connection.create_offer(None).await?;
        self.connection
            .set_local_description(offer.clone())
            .await?;
        Ok(offer.sdp)
    }

    /// Handle a remote SDP offer and return our answer
    pub async fn handle_offer(&self, sdp: &str) -> Result<String> {
        let offer = RTCSessionDescription::offer(sdp.to_string())?;
        self.connection.set_remote_description(offer).await?;

        let answer = self.connection.create_answer(None).await?;
        self.connection
            .set_local_description(answer.clone())
            .await?;
        Ok(answer.sdp)
    }

    /// Handle a remote SDP answer
    pub async fn handle_answer(&self, sdp: &str) -> Result<()> {
        let answer = RTCSessionDescription::answer(sdp.to_string())?;
        self.connection.set_remote_description(answer).await?;
        Ok(())
    }

    /// Add a remote ICE candidate
    pub async fn add_ice_candidate(
        &self,
        candidate: &str,
        sdp_mid: Option<String>,
        sdp_mline_index: Option<u16>,
    ) -> Result<()> {
        let ice_candidate = webrtc::ice_transport::ice_candidate::RTCIceCandidateInit {
            candidate: candidate.to_string(),
            sdp_mid,
            sdp_mline_index,
            username_fragment: None,
        };
        self.connection
            .add_ice_candidate(ice_candidate)
            .await
            .context("Failed to add ICE candidate")?;
        Ok(())
    }

    /// Send encoded opus audio as an RTP packet
    pub async fn send_audio(&self, frame: &EncodedFrame) -> Result<()> {
        use bytes::Bytes;
        use webrtc::rtp::header::Header;
        use webrtc::rtp::packet::Packet;

        let seq = self.rtp_seq.fetch_add(1, Ordering::Relaxed);
        let ts = self.rtp_ts.fetch_add(FRAME_SIZE as u32, Ordering::Relaxed);

        let packet = Packet {
            header: Header {
                version: 2,
                payload_type: 111, // Opus
                sequence_number: seq,
                timestamp: ts,
                ssrc: self.rtp_ssrc,
                marker: false,
                ..Default::default()
            },
            payload: Bytes::copy_from_slice(&frame.data),
        };
        self.audio_track
            .write_rtp(&packet)
            .await
            .context("Failed to write RTP")?;
        Ok(())
    }

    pub async fn close(&self) {
        let _ = self.connection.close().await;
    }
}
