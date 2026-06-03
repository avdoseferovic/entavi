use bytes::Bytes;
use serde::{Deserialize, Serialize};

// ── Audio constants ──

pub const SAMPLE_RATE: u32 = 48_000;
pub const CHANNELS: u16 = 1; // mono
pub const FRAME_SIZE: usize = 960; // 20ms at 48kHz
pub type PcmFrame = [f32; FRAME_SIZE];

// Keep real-time audio queues short. If processing falls behind, dropping audio
// is preferable to unbounded memory growth and high-latency playback.
pub const AUDIO_CAPTURE_QUEUE_FRAMES: usize = 3; // 60ms
pub const AUDIO_DECODE_QUEUE_FRAMES: usize = 4; // 80ms
pub const AUDIO_PLAYBACK_QUEUE_FRAMES: usize = 4; // 80ms

// ── Peer info (sent in room_joined / peer_joined) ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerInfo {
    pub peer_id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub is_host: bool,
}

// ── Signaling protocol messages ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SignalMessage {
    Join {
        room_id: String,
        peer_id: String,
        name: String,
        #[serde(default)]
        password: Option<String>,
        #[serde(default)]
        create: bool,
    },
    Leave {
        room_id: String,
        peer_id: String,
    },
    Signal {
        #[serde(skip_serializing_if = "Option::is_none")]
        to: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        from: Option<String>,
        payload: SignalPayload,
    },
    MuteState {
        muted: bool,
    },
    // Server → Client
    PeerMuteState {
        peer_id: String,
        muted: bool,
    },
    RoomJoined {
        room_id: String,
        peers: Vec<PeerInfo>,
        #[serde(default)]
        is_host: bool,
        #[serde(default)]
        locked: bool,
        #[serde(default)]
        turn_servers: Vec<TurnServerInfo>,
    },
    PeerJoined {
        peer_id: String,
        #[serde(default)]
        name: String,
        #[serde(default)]
        is_host: bool,
    },
    PeerLeft {
        peer_id: String,
    },
    RoomNotFound,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SignalPayload {
    Offer {
        sdp: String,
    },
    Answer {
        sdp: String,
    },
    IceCandidate {
        candidate: String,
        sdp_mid: Option<String>,
        sdp_mline_index: Option<u16>,
    },
}

// ── TURN server info (provided by signaling server) ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TurnServerInfo {
    pub urls: Vec<String>,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub credential: String,
}

// ── Call state ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum CallState {
    Idle,
    Connecting,
    InRoom {
        room_id: String,
        room_name: String,
        is_host: bool,
        locked: bool,
    },
    Reconnecting {
        room_id: String,
        room_name: String,
        attempt: u32,
    },
    Error {
        message: String,
    },
}

// ── Frontend event names ──

pub const EVENT_STATE_CHANGED: &str = "state-changed";
pub const EVENT_PEER_JOINED: &str = "peer-joined";
pub const EVENT_PEER_LEFT: &str = "peer-left";
pub const EVENT_ERROR: &str = "error";
pub const EVENT_PING_UPDATE: &str = "ping-update";
pub const EVENT_VOICE_ACTIVITY: &str = "voice-activity";
pub const EVENT_PEER_MUTE_CHANGED: &str = "peer-mute-changed";
pub const EVENT_MIC_TEST_LEVEL: &str = "mic-test-level";

// ── Audio device info (for mic selector) ──

#[derive(Debug, Clone, Serialize)]
pub struct AudioDevice {
    pub name: String,
    pub is_default: bool,
}

// ── Voice activity event (emitted to frontend) ──

#[derive(Debug, Clone, Serialize)]
pub struct VoiceActivityEvent {
    pub speaking: Vec<String>,
    pub self_speaking: bool,
}

// ── Peer mute event (emitted to frontend) ──

#[derive(Debug, Clone, Serialize)]
pub struct PeerMuteEvent {
    pub peer_id: String,
    pub muted: bool,
}

// ── Encoded audio frame (mic → network) ──

#[derive(Debug, Clone)]
pub struct EncodedFrame {
    pub data: Bytes,
}

// ── Decoded audio frame (network → speaker) ──

#[derive(Debug, Clone)]
pub struct DecodedFrame {
    pub samples: PcmFrame,
    pub len: usize,
}
