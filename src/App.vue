<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { useAppState } from './composables/useAppState'
import { useTauri } from './composables/useTauri'
import { setupListeners } from './composables/useTauriEvents'
import { parseCode } from './lib/callcode'
import AppBar from './components/AppBar.vue'
import QrHomeView from './components/QrHomeView.vue'
import ScanView from './components/ScanView.vue'
import RoomView from './components/RoomView.vue'
import SettingsModal from './components/SettingsModal.vue'

const { state, resetRoomState, setStatus, getDisplayName } = useAppState()
const tauri = useTauri()

const isTauriHost = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

let unlisteners: UnlistenFn[] = []

const codeLoading = ref(false)
const codeError = ref('')
const endedToast = ref(false)
let hosting = false

async function toggleMute() {
  state.isMuted = !state.isMuted
  try {
    await tauri.setMuted(state.isMuted)
  } catch (err) {
    console.error('Mute error:', err)
    state.isMuted = !state.isMuted
    return
  }
  await tauri.emitMuteState(state.isMuted)
}

/** Host a fresh, live call code: create a room and stay on the QR home until someone connects. */
async function hostNewCode() {
  if (hosting) return
  hosting = true
  codeError.value = ''
  codeLoading.value = true
  try {
    await tauri.leaveRoom().catch(() => {})
    resetRoomState()
    state.currentView = 'home'
    const code = await tauri.createRoom('Entavi call', getDisplayName(), null)
    state.roomCode = code
    setStatus('Waiting for a call…', 'connected')
  } catch (err) {
    codeError.value = `${err}`
  } finally {
    codeLoading.value = false
    hosting = false
  }
}

/** Connect to someone else's code (scanned or pasted). */
async function connectToCode(raw: string) {
  const code = parseCode(raw)
  if (!code) return
  await tauri.leaveRoom().catch(() => {})
  resetRoomState()
  state.roomCode = code
  state.isJoining = true
  state.roomNotFound = false
  state.currentView = 'room'
  try {
    await tauri.joinRoom(code, getDisplayName(), null)
  } catch (err) {
    state.isJoining = false
    setStatus(`${err}`, 'error')
    state.currentView = 'scan'
  }
}

async function endCall() {
  await tauri.leaveRoom().catch(() => {})
  resetRoomState()
  tauri.emitMuteState(false)
  endedToast.value = true
  setTimeout(() => { endedToast.value = false }, 2600)
  await hostNewCode()
}

// When someone connects to our live code, drop into the call.
watch(
  () => state.peerList.size,
  (n) => {
    if (n > 0 && state.currentView === 'home') {
      state.currentView = 'room'
      tauri.showNotification('Incoming call', 'Someone used your code — connecting securely')
    }
  },
)

// Always keep a live code ready whenever we land back on home without one.
watch(
  () => [state.currentView, state.roomCode] as const,
  ([view, code]) => {
    if (view === 'home' && !code && !hosting) hostNewCode()
  },
)

onMounted(async () => {
  // Tauri-only wiring — skipped when the frontend is opened in a plain browser
  // (use the web/ app for browser previews; this is the desktop webview frontend).
  if (isTauriHost) {
    const savedNoiseSuppression = localStorage.getItem('entavi:noiseSuppression')
    if (savedNoiseSuppression !== null) {
      state.noiseSuppression = savedNoiseSuppression !== 'false'
    }
    tauri.setNoiseSuppression(state.noiseSuppression)

    const savedOutputDevice = localStorage.getItem('entavi:outputDevice')
    if (savedOutputDevice) {
      state.selectedOutput = savedOutputDevice
      tauri.setOutputDevice(savedOutputDevice)
    }

    unlisteners = await setupListeners()
    window.addEventListener('entavi:tray-toggle-mute', toggleMute)
    tauri.checkForUpdates()
  }

  // Generate the user's live call code on launch.
  hostNewCode()
})

onUnmounted(() => {
  unlisteners.forEach((fn) => fn())
  window.removeEventListener('entavi:tray-toggle-mute', toggleMute)
})
</script>

<template>
  <div class="app-shell">
    <AppBar
      v-if="state.currentView !== 'room'"
      @settings="state.showSettings = true"
    />

    <div v-if="state.currentView !== 'room'" class="surface-canvas">
      <QrHomeView
        v-if="state.currentView === 'home'"
        :code="state.roomCode"
        :loading="codeLoading"
        :error="codeError"
        @rotate="hostNewCode"
        @scan="state.currentView = 'scan'"
      />
      <ScanView
        v-else-if="state.currentView === 'scan'"
        @connect="connectToCode"
        @back="state.currentView = 'home'"
      />
    </div>

    <RoomView
      v-else
      @toggle-mute="toggleMute"
      @leave="endCall"
    />

    <SettingsModal
      v-if="state.showSettings"
      @close="state.showSettings = false"
    />

    <div v-if="endedToast" class="ended">
      <span class="lk"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
      Call ended · nothing was saved
    </div>
  </div>
</template>
