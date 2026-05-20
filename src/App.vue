<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { getVersion } from '@tauri-apps/api/app'
import { useAppState } from './composables/useAppState'
import { useTauri } from './composables/useTauri'
import { setupListeners } from './composables/useTauriEvents'
import HomeView from './components/HomeView.vue'
import CreateView from './components/CreateView.vue'
import JoinView from './components/JoinView.vue'
import RoomView from './components/RoomView.vue'
import SettingsModal from './components/SettingsModal.vue'

const { state, resetRoomState, setStatus, getDisplayName } = useAppState()
const tauri = useTauri()
const appVersion = ref('')

let unlisteners: UnlistenFn[] = []

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

async function createRoom(roomName: string, password: string | null) {
  tauri.stopMicTest().catch(() => {})
  state.isMicTesting = false
  state.roomName = roomName
  setStatus('Starting room...', 'connecting')
  state.currentView = 'room'

  try {
    const roomId = await tauri.createRoom(roomName, getDisplayName(), password)
    state.roomCode = roomId
    setStatus('Waiting for peers...', 'connected')
    tauri.showNotification('Room Created', `${roomName} — Code: ${roomId}`)
  } catch (err) {
    setStatus(`${err}`, 'error')
  }
}

async function joinRoom(roomId: string, password: string | null) {
  tauri.stopMicTest().catch(() => {})
  state.isMicTesting = false
  state.roomCode = roomId
  state.roomName = `Room ${roomId}`
  state.isJoining = true
  state.roomNotFound = false

  try {
    await tauri.joinRoom(roomId, getDisplayName(), password)
  } catch (err) {
    state.isJoining = false
    setStatus(`${err}`, 'error')
  }
}

async function leaveRoom() {
  try {
    await tauri.leaveRoom()
  } catch (err) {
    console.error('Leave room error:', err)
  }
  const roomName = state.roomName
  state.currentView = 'home'
  tauri.showNotification('Left Room', roomName || 'Disconnected')
  resetRoomState()
  tauri.emitMuteState(false)
}

function onTrayToggleMute() {
  toggleMute()
}

onMounted(async () => {
  appVersion.value = await getVersion()

  // Restore persisted settings from localStorage
  const savedName = localStorage.getItem('entavi:displayName')
  if (savedName) state.displayName = savedName

  const savedSignalingUrl = localStorage.getItem('entavi:signalingUrl')
  if (savedSignalingUrl) {
    state.signalingUrl = savedSignalingUrl
    tauri.setSignalingUrl(savedSignalingUrl)
  }

  const savedNoiseSuppression = localStorage.getItem('entavi:noiseSuppression')
  if (savedNoiseSuppression !== null) {
    state.noiseSuppression = savedNoiseSuppression !== 'false'
  }
  tauri.setNoiseSuppression(state.noiseSuppression)

  // Restore voice sensitivity
  const savedVoiceSensitivity = localStorage.getItem('entavi:voiceSensitivity')
  if (savedVoiceSensitivity !== null) {
    state.voiceSensitivity = parseInt(savedVoiceSensitivity)
  }
  const vadThreshold = Math.pow(10, -4 + 3 * state.voiceSensitivity / 100)
  tauri.setVadThreshold(vadThreshold)

  // Restore AGC
  const savedAgc = localStorage.getItem('entavi:agc')
  if (savedAgc !== null) {
    state.agcEnabled = savedAgc !== 'false'
  }
  tauri.setAgc(state.agcEnabled)

  // Restore output device
  const savedOutputDevice = localStorage.getItem('entavi:outputDevice')
  if (savedOutputDevice) {
    state.selectedOutput = savedOutputDevice
    tauri.setOutputDevice(savedOutputDevice)
  }

  // Restore keyboard shortcuts
  const savedToggleMute = localStorage.getItem('entavi:shortcutToggleMute')
  if (savedToggleMute) {
    tauri.setShortcut('toggle_mute', savedToggleMute).catch(() => {
      localStorage.removeItem('entavi:shortcutToggleMute')
    })
  }
  const savedPushToTalk = localStorage.getItem('entavi:shortcutPushToTalk')
  if (savedPushToTalk) {
    tauri.setShortcut('push_to_talk', savedPushToTalk).catch(() => {
      localStorage.removeItem('entavi:shortcutPushToTalk')
    })
  }

  unlisteners = await setupListeners()
  window.addEventListener('entavi:tray-toggle-mute', onTrayToggleMute)

  // Check for updates (non-blocking, logged on Rust side)
  tauri.checkForUpdates()
})

onUnmounted(() => {
  unlisteners.forEach((fn) => fn())
  window.removeEventListener('entavi:tray-toggle-mute', onTrayToggleMute)
})
</script>

<template>
  <div class="container">
    <header v-if="state.currentView === 'home'">
      <h1 class="wordmark">Entavi</h1>
      <p class="wordmark-eyebrow">Peer-to-peer voice</p>
      <p v-if="appVersion" class="version-pill">v{{ appVersion }}</p>
    </header>

    <HomeView
      v-if="state.currentView === 'home'"
      @create="state.currentView = 'create'"
      @join="state.currentView = 'join'"
    />
    <CreateView
      v-if="state.currentView === 'create'"
      @back="state.currentView = 'home'"
      @create="(roomName, password) => createRoom(roomName, password)"
    />
    <JoinView
      v-if="state.currentView === 'join'"
      @back="state.currentView = 'home'"
      @join="(roomId, password) => joinRoom(roomId, password)"
    />
    <RoomView
      v-if="state.currentView === 'room'"
      @toggle-mute="toggleMute"
      @leave="leaveRoom"
    />

    <SettingsModal
      v-if="state.showSettings"
      @close="state.showSettings = false"
    />
  </div>
</template>
