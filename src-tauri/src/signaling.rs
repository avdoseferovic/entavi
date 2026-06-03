use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::Result;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::Mutex;
use tokio_tungstenite::{connect_async, tungstenite::Message};

use crate::types::SignalMessage;

/// How often to send a WebSocket ping to keep the connection alive.
const PING_INTERVAL: Duration = Duration::from_secs(30);

/// How often to send an application-level ping for RTT measurement.
const RTT_PING_INTERVAL: Duration = Duration::from_secs(2);

/// Maximum reconnection attempts before giving up.
const MAX_RECONNECT_ATTEMPTS: u32 = 10;

const OUTGOING_QUEUE_MESSAGES: usize = 256;
const INCOMING_QUEUE_MESSAGES: usize = 256;
const RTT_QUEUE_MESSAGES: usize = 8;
const STATUS_QUEUE_MESSAGES: usize = 16;

#[derive(Debug, Clone)]
pub enum SignalingStatus {
    Connected,
    Disconnected,
    Reconnecting { attempt: u32 },
    Failed,
}

/// A persistent signaling client that reconnects on failure.
/// The channels persist across reconnects - the engine loop never sees channel closure
/// unless the SignalingClient is dropped or max retries are exhausted.
pub struct SignalingClient {
    pub outgoing_tx: flume::Sender<SignalMessage>,
    pub incoming_rx: flume::Receiver<SignalMessage>,
    pub rtt_rx: flume::Receiver<u64>,
    pub status_rx: flume::Receiver<SignalingStatus>,
}

impl SignalingClient {
    pub async fn connect(url: &str) -> Result<Self> {
        // These channels persist across reconnects
        let (outgoing_tx, outgoing_rx) = flume::bounded::<SignalMessage>(OUTGOING_QUEUE_MESSAGES);
        let (incoming_tx, incoming_rx) = flume::bounded::<SignalMessage>(INCOMING_QUEUE_MESSAGES);
        let (rtt_tx, rtt_rx) = flume::bounded::<u64>(RTT_QUEUE_MESSAGES);
        let (status_tx, status_rx) = flume::bounded::<SignalingStatus>(STATUS_QUEUE_MESSAGES);

        let url = url.to_string();

        // Spawn the main connection loop
        tokio::spawn(async move {
            let mut attempt: u32 = 0;

            loop {
                match connect_async(&url).await {
                    Ok((ws_stream, _)) => {
                        attempt = 0;
                        let _ = status_tx.send_async(SignalingStatus::Connected).await;
                        tracing::info!("Signaling WS connected to {url}");

                        let (mut ws_tx, mut ws_rx) = ws_stream.split();

                        // Shared instant for RTT measurement
                        let ping_sent_at: Arc<Mutex<Option<Instant>>> = Arc::new(Mutex::new(None));
                        let ping_sent_at_write = Arc::clone(&ping_sent_at);
                        let ping_sent_at_read = Arc::clone(&ping_sent_at);

                        // Flag to signal the write task to stop when read task exits
                        let ws_closed = Arc::new(std::sync::atomic::AtomicBool::new(false));
                        let ws_closed_write = Arc::clone(&ws_closed);

                        let incoming_tx_clone = incoming_tx.clone();
                        let rtt_tx_clone = rtt_tx.clone();
                        let outgoing_rx_clone = outgoing_rx.clone();

                        // Write task: forward outgoing messages + pings
                        let write_handle = tokio::spawn(async move {
                            let mut ping_interval = tokio::time::interval(PING_INTERVAL);
                            ping_interval.tick().await;
                            let mut rtt_interval = tokio::time::interval(RTT_PING_INTERVAL);
                            rtt_interval.tick().await;

                            loop {
                                if ws_closed_write.load(std::sync::atomic::Ordering::Relaxed) {
                                    break;
                                }
                                tokio::select! {
                                    msg = outgoing_rx_clone.recv_async() => {
                                        let Ok(msg) = msg else { break };
                                        let text = match serde_json::to_string(&msg) {
                                            Ok(t) => t,
                                            Err(e) => {
                                                tracing::error!("Failed to serialize outgoing signal: {e}");
                                                continue;
                                            }
                                        };
                                        if ws_tx.send(Message::Text(text)).await.is_err() {
                                            tracing::warn!("WS send failed, connection likely closed");
                                            break;
                                        }
                                    }
                                    _ = ping_interval.tick() => {
                                        if ws_tx.send(Message::Ping(vec![])).await.is_err() {
                                            break;
                                        }
                                    }
                                    _ = rtt_interval.tick() => {
                                        *ping_sent_at_write.lock().await = Some(Instant::now());
                                        if ws_tx.send(Message::Text("ping".into())).await.is_err() {
                                            break;
                                        }
                                    }
                                }
                            }
                        });

                        // Read task: forward incoming messages to engine
                        while let Some(Ok(msg)) = ws_rx.next().await {
                            match msg {
                                Message::Text(text) => {
                                    if text == "pong" {
                                        let mut guard = ping_sent_at_read.lock().await;
                                        if let Some(sent) = guard.take() {
                                            let rtt_ms = sent.elapsed().as_millis() as u64;
                                            let _ = rtt_tx_clone.try_send(rtt_ms);
                                        }
                                        continue;
                                    }
                                    match serde_json::from_str::<SignalMessage>(&text) {
                                        Ok(signal) => {
                                            if incoming_tx_clone.send_async(signal).await.is_err() {
                                                return; // engine dropped, exit entirely
                                            }
                                        }
                                        Err(e) => {
                                            tracing::warn!(
                                                "Failed to parse incoming signal: {e} - {text}"
                                            );
                                        }
                                    }
                                }
                                Message::Pong(_) => {}
                                Message::Close(_) => break,
                                _ => {}
                            }
                        }

                        // WS read loop exited - signal write task to stop
                        ws_closed.store(true, std::sync::atomic::Ordering::Relaxed);
                        write_handle.abort();

                        tracing::info!("Signaling WS connection closed, will attempt reconnect");
                        let _ = status_tx.send_async(SignalingStatus::Disconnected).await;
                    }
                    Err(e) => {
                        tracing::warn!("Signaling WS connect failed (attempt {attempt}): {e}");
                    }
                }

                // Reconnect with exponential backoff
                attempt += 1;
                if attempt > MAX_RECONNECT_ATTEMPTS {
                    tracing::error!(
                        "Signaling reconnection failed after {MAX_RECONNECT_ATTEMPTS} attempts"
                    );
                    let _ = status_tx.send_async(SignalingStatus::Failed).await;
                    break;
                }

                let _ = status_tx
                    .send_async(SignalingStatus::Reconnecting { attempt })
                    .await;

                let base_delay = Duration::from_secs(1) * 2u32.saturating_pow(attempt - 1);
                let delay = base_delay.min(Duration::from_secs(30));
                // Add 20% jitter
                let jitter_ms = (delay.as_millis() as f64 * 0.2 * rand::random::<f64>()) as u64;
                let total_delay = delay + Duration::from_millis(jitter_ms);

                tracing::info!(
                    "Reconnecting in {:?} (attempt {attempt}/{MAX_RECONNECT_ATTEMPTS})",
                    total_delay
                );
                tokio::time::sleep(total_delay).await;

                // Check if engine dropped the outgoing channel
                if outgoing_rx.is_disconnected() {
                    tracing::info!("Engine dropped, stopping reconnection");
                    break;
                }
            }
        });

        Ok(Self {
            outgoing_tx,
            incoming_rx,
            rtt_rx,
            status_rx,
        })
    }
}

/// Legacy connect function - delegates to SignalingClient for backwards compatibility.
pub async fn connect(
    url: &str,
) -> Result<(
    flume::Sender<SignalMessage>,
    flume::Receiver<SignalMessage>,
    flume::Receiver<u64>,
    flume::Receiver<SignalingStatus>,
)> {
    let client = SignalingClient::connect(url).await?;
    Ok((
        client.outgoing_tx,
        client.incoming_rx,
        client.rtt_rx,
        client.status_rx,
    ))
}
