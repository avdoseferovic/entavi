use std::time::Duration;

use anyhow::{Context, Result};
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::{connect_async, tungstenite::Message};

use crate::types::SignalMessage;

/// How often to send a WebSocket ping to keep the connection alive.
const PING_INTERVAL: Duration = Duration::from_secs(30);

/// Connects to the signaling server and returns channels for the engine.
///
/// - `outgoing_rx`: engine sends SignalMessages here → serialized to WS
/// - `incoming_tx`: WS messages → deserialized → engine reads from paired rx
pub async fn connect(
    url: &str,
) -> Result<(
    flume::Sender<SignalMessage>,   // outgoing_tx — engine writes here
    flume::Receiver<SignalMessage>, // incoming_rx — engine reads from here
)> {
    let (ws_stream, _) = connect_async(url)
        .await
        .context("Failed to connect to signaling server")?;

    let (mut ws_tx, mut ws_rx) = ws_stream.split();

    // Engine → WS
    let (outgoing_tx, outgoing_rx) = flume::unbounded::<SignalMessage>();
    // WS → Engine
    let (incoming_tx, incoming_rx) = flume::unbounded::<SignalMessage>();

    // Task: forward outgoing messages to the websocket + periodic keepalive pings
    tokio::spawn(async move {
        let mut ping_interval = tokio::time::interval(PING_INTERVAL);
        ping_interval.tick().await; // skip the immediate first tick

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
            }
        }
    });

    // Task: forward incoming websocket messages to the engine
    tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_rx.next().await {
            match msg {
                Message::Text(text) => {
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

    Ok((outgoing_tx, incoming_rx))
}
