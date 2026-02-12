# Entavi

Entavi is a peer-to-peer voice chat app. You create a room, share the code, and talk — no accounts, no servers routing your audio. Everything goes directly between you and the people in the room.

## How it works

The app is built with Tauri (Rust backend, web frontend). When you create or join a room, a lightweight signaling server on Cloudflare helps peers find each other, but once connected, all audio flows directly between participants over WebRTC.

Audio is captured from your mic, cleaned up with RNNoise for noise suppression, encoded with Opus at 64kbps, and streamed straight to everyone else in the room. On the receiving end, audio from all peers gets decoded, mixed together, and played back.

The signaling server is just a WebSocket relay — it passes connection info between peers so they can establish direct links. It never touches your audio.

## Features

- **Room codes** — 6-character codes to create and join rooms
- **Host controls** — kick peers, force-mute, password-protect rooms
- **Noise suppression** — RNNoise cleans up background noise
- **Mic testing** — test your mic and pick your input device before joining
- **System tray** — sits in your tray, toggle mute from there
- **Cross-platform** — macOS, Linux, Windows

## Running it

```
npm install
npm run tauri dev
```

The signaling server lives in `signaling-server/` and deploys to Cloudflare Workers:

```
cd signaling-server
npm install
npm run deploy
```

## Stack

- **Desktop**: Tauri 2.0
- **Audio**: Opus codec, CPAL for I/O, RNNoise for denoising
- **Networking**: WebRTC (webrtc-rs), Tokio
- **Signaling**: Cloudflare Workers + Durable Objects
- **Frontend**: TypeScript, Vite
