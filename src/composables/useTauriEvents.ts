import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  CallState,
  PeerInfo,
  VoiceActivityEvent,
  PeerMuteEvent,
} from "../types";
import { useAppState } from "./useAppState";
import { useTauri } from "./useTauri";

export async function setupListeners(): Promise<UnlistenFn[]> {
  const { state, setStatus } = useAppState();
  const { showNotification } = useTauri();

  const unlisteners: UnlistenFn[] = [];

  unlisteners.push(
    await listen("tray-toggle-mute", async () => {
      // Handled by App.vue via a shared toggleMute function
      // We emit a custom DOM event so App.vue can call toggleMute
      window.dispatchEvent(new CustomEvent("entavi:tray-toggle-mute"));
    }),
  );

  unlisteners.push(
    await listen<CallState>("state-changed", (event) => {
      const s = event.payload;
      switch (s.state) {
        case "idle":
          break;
        case "connecting":
          setStatus("Connecting...", "connecting");
          break;
        case "in_room":
          setStatus("Connected", "connected");
          // Clear reconnecting state
          if (state.isReconnecting) {
            state.isReconnecting = false;
            state.reconnectAttempt = 0;
          }
          // Switch to room view when server confirms join
          if (state.isJoining) {
            state.isJoining = false;
            state.currentView = "room";
            showNotification("Joined Room", `Code: ${state.roomCode}`);
          }
          break;
        case "reconnecting":
          state.isReconnecting = true;
          state.reconnectAttempt = s.attempt ?? 0;
          setStatus(
            `Reconnecting... (attempt ${state.reconnectAttempt})`,
            "connecting",
          );
          break;
        case "error":
          state.isJoining = false;
          // QR-based flow: a failed connect returns to the scanner with a hint.
          if (s.message === "Room not found") {
            state.roomNotFound = true;
            state.currentView = "scan";
          } else {
            setStatus(s.message ?? "An error occurred", "error");
            if (state.currentView === "room" && state.peerList.size === 0) {
              state.currentView = "scan";
            }
          }
          break;
      }
    }),
  );

  unlisteners.push(
    await listen<PeerInfo>("peer-joined", (event) => {
      console.log("Peer joined:", event.payload);
      const { peer_id, name } = event.payload;
      if (!state.peerList.has(peer_id)) {
        state.peerList.set(peer_id, name);
        // Trigger reactivity by reassigning the map
        state.peerList = new Map(state.peerList);
      }
    }),
  );

  unlisteners.push(
    await listen<string>("peer-left", (event) => {
      console.log("Peer left:", event.payload);
      state.peerList.delete(event.payload);
      state.peerList = new Map(state.peerList);
      state.mutedPeers.delete(event.payload);
      state.mutedPeers = new Set(state.mutedPeers);
      state.speakingPeers.delete(event.payload);
      state.speakingPeers = new Set(state.speakingPeers);
    }),
  );

  unlisteners.push(
    await listen<string>("error", (event) => {
      console.error("Engine error:", event.payload);
      setStatus(event.payload, "error");
    }),
  );

  unlisteners.push(
    await listen<number>("ping-update", (event) => {
      state.pingMs = event.payload;
    }),
  );

  unlisteners.push(
    await listen<VoiceActivityEvent>("voice-activity", (event) => {
      const { speaking, self_speaking } = event.payload;
      state.selfSpeaking = self_speaking;
      state.speakingPeers = new Set(speaking);
    }),
  );

  unlisteners.push(
    await listen<number>("mic-test-level", (event) => {
      state.micTestLevel = event.payload;
    }),
  );

  unlisteners.push(
    await listen<PeerMuteEvent>("peer-mute-changed", (event) => {
      const { peer_id, muted } = event.payload;
      if (muted) {
        state.mutedPeers.add(peer_id);
      } else {
        state.mutedPeers.delete(peer_id);
      }
      state.mutedPeers = new Set(state.mutedPeers);
    }),
  );

  return unlisteners;
}
