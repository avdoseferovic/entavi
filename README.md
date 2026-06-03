# Entavi

Entavi is a small peer-to-peer voice app for quick calls. Open it, get a live
call code, share that code with someone else, and talk.

There are no accounts to create and no central media server carrying the call.
Entavi uses a signaling server only long enough for peers to find each other.
After that, audio is sent directly between participants over WebRTC.

## Why this exists

Most voice tools assume a workspace, contact list, invite flow, or meeting link.
Entavi is meant to feel closer to handing someone a temporary code:

- launch the app
- share the code or QR link
- start talking when the other person joins
- leave without keeping a room around

The app is built for short-lived calls where the code is the invitation.

## What is in the repo

The repository is split across these main pieces:

- `src/` - the Vue frontend used by the desktop app
- `src-tauri/` - the Rust/Tauri desktop runtime, audio engine, tray integration,
  updater wiring, and WebRTC connection handling
- `web/` - a browser version that reuses the shared Vue components and swaps the
  Tauri IPC layer for browser-native WebRTC code
- `signaling-server/` - a Cloudflare Worker and Durable Object WebSocket relay
- `website/` - the public marketing site

## How calls work

1. The app creates or joins a room through the Cloudflare signaling worker.
2. The signaling worker relays WebRTC offer/answer and ICE messages between
   peers.
3. Once the peer connection is established, audio flows directly between the
   participants.
4. The signaling worker keeps relaying lightweight room events, such as joins,
   leaves, reconnects, and mute state.

The worker does not receive decoded call audio. It only handles connection setup
and room coordination.

## Current features

- Live call codes and QR-style invite links
- Desktop app built with Tauri 2
- Browser-hosted web app that shares most of the UI
- Peer-to-peer audio over WebRTC
- Opus audio encoding in the desktop app
- Microphone input selection and mic testing
- Output device selection in the desktop app
- RNNoise-based noise suppression through `nnnoiseless`
- System tray controls for opening the app, muting, and quitting
- Reconnect handling for short signaling drops
- Cloudflare Durable Object signaling backend

## Run the desktop app

Install the JavaScript dependencies first:

```sh
npm install
```

Then start the Tauri app:

```sh
npm run tauri dev
```

The Tauri dev server uses Vite on `http://localhost:1420`.

To create a production desktop build:

```sh
npm run tauri build
```

## Run the web app

The browser app lives in `web/`:

```sh
cd web
npm install
npm run dev
```

By default, it runs on `http://localhost:5173`.

## Run the signaling server locally

The signaling worker lives in `signaling-server/`:

```sh
cd signaling-server
npm install
npm run dev
```

Deploy it to Cloudflare Workers with:

```sh
npm run deploy
```

The desktop and web clients default to:

```text
wss://entavi-signaling.avdo.workers.dev/ws
```

For local signaling tests, point the client engine at your Worker URL before
creating or joining a room. Both the desktop and browser engines expose a
`setSignalingUrl` hook for that.

## Tech stack

- Tauri 2 and Rust for the desktop shell
- Vue 3, TypeScript, and Vite for the frontend
- WebRTC for peer connections
- CPAL for desktop audio input/output
- Opus for desktop audio encoding
- `nnnoiseless` for RNNoise-style noise suppression
- Cloudflare Workers and Durable Objects for signaling

## Project status

Entavi is still a work in progress. The basics are in place: temporary room
codes, peer discovery, direct audio, mute state, mic testing, and reconnect
handling. Expect rough edges while the desktop app, browser app, and signaling
service continue to evolve together.
