use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::Mutex;
use tokio_tungstenite::{connect_async, tungstenite::Message};

use crate::types::SignalMessage;

/// How often to send a WebSocket ping to keep the connection alive.
const PING_INTERVAL: Duration = Duration::from_secs(30);

/// How often to send an application-level ping for RTT measurement.
const RTT_PING_INTERVAL: Duration = Duration::from_secs(2);

/// Connects to the signaling server and returns channels for the engine.
///
/// - `outgoing_rx`: engine sends SignalMessages here → serialized to WS
/// - `incoming_tx`: WS messages → deserialized → engine reads from paired rx
pub async fn connect(
    url: &str,
) -> Result<(
    flume::Sender<SignalMessage>,   // outgoing_tx — engine writes here
    flume::Receiver<SignalMessage>, // incoming_rx — engine reads from here
    flume::Receiver<u64>,           // rtt_rx — RTT measurements in ms
)> {
    let (ws_stream, _) = connect_async(url)
        .await
        .context("Failed to connect to signaling server")?;

    let (mut ws_tx, mut ws_rx) = ws_stream.split();

    // Engine → WS
    let (outgoing_tx, outgoing_rx) = flume::unbounded::<SignalMessage>();
    // WS → Engine
    let (incoming_tx, incoming_rx) = flume::unbounded::<SignalMessage>();
    // RTT measurements
    let (rtt_tx, rtt_rx) = flume::unbounded::<u64>();

    // Shared instant for measuring RTT of application-level ping/pong
    let ping_sent_at: Arc<Mutex<Option<Instant>>> = Arc::new(Mutex::new(None));
    let ping_sent_at_write = Arc::clone(&ping_sent_at);
    let ping_sent_at_read = Arc::clone(&ping_sent_at);

    // Task: forward outgoing messages to the websocket + periodic keepalive pings + RTT pings
    tokio::spawn(async move {
        let mut ping_interval = tokio::time::interval(PING_INTERVAL);
        ping_interval.tick().await; // skip the immediate first tick

        let mut rtt_interval = tokio::time::interval(RTT_PING_INTERVAL);
        rtt_interval.tick().await; // skip the immediate first tick

        loop {
            tokio::select! {
                msg = outgoing_rx.recv_async() => {
                    let Ok(msg) = msg else { break };
                    let text = match serde_json::to_string(&msg) {
                        Ok(t) => t,
                        Err(e) => {
                            tracing::error!("Failed to serialize outgoing signal: {e}");
                            continue;
                        }
                    };
                    if ws_tx.send(Message::Text(text.into())).await.is_err() {
                        tracing::warn!("WS send failed, connection likely closed");
                        break;
                    }
                }
                _ = ping_interval.tick() => {
                    if ws_tx.send(Message::Ping(vec![].into())).await.is_err() {
                        tracing::warn!("WS ping failed, connection likely closed");
                        break;
                    }
                }
                _ = rtt_interval.tick() => {
                    *ping_sent_at_write.lock().await = Some(Instant::now());
                    if ws_tx.send(Message::Text("ping".into())).await.is_err() {
                        tracing::warn!("WS RTT ping failed, connection likely closed");
                        break;
                    }
                }
            }
        }
    });

    // Task: forward incoming websocket messages to the engine
    tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_rx.next().await {
            match msg {
                Message::Text(text) => {
                    // Application-level pong for RTT measurement
                    if text == "pong" {
                        let mut guard = ping_sent_at_read.lock().await;
                        if let Some(sent) = guard.take() {
                            let rtt_ms = sent.elapsed().as_millis() as u64;
                            let _ = rtt_tx.send(rtt_ms);
                        }
                        continue;
                    }

                    match serde_json::from_str::<SignalMessage>(&text) {
                        Ok(signal) => {
                            if incoming_tx.send(signal).is_err() {
                                break; // engine dropped
                            }
                        }
                        Err(e) => {
                            tracing::warn!("Failed to parse incoming signal: {e} — {text}");
                        }
                    }
                }
                Message::Pong(_) => {
                    // Keepalive response received — nothing to do
                }
                _ => {}
            }
        }
        tracing::info!("Signaling WS connection closed");
    });

    Ok((outgoing_tx, incoming_rx, rtt_rx))
}
