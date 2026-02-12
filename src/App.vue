<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { useAppState } from './composables/useAppState'
import { useTauri } from './composables/useTauri'
import { setupListeners } from './composables/useTauriEvents'
import HomeView from './components/HomeView.vue'
import CreateView from './components/CreateView.vue'
import JoinView from './components/JoinView.vue'
import RoomView from './components/RoomView.vue'

const { state, resetRoomState, setStatus, getDisplayName } = useAppState()
const tauri = useTauri()

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
  setStatus('Connecting to room...', 'connecting')
  state.currentView = 'room'

  try {
    await tauri.joinRoom(roomId, getDisplayName(), password)
    tauri.showNotification('Joined Room', `Code: ${roomId}`)
  } catch (err) {
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
  unlisteners = await setupListeners()
  window.addEventListener('entavi:tray-toggle-mute', onTrayToggleMute)
})

onUnmounted(() => {
  unlisteners.forEach((fn) => fn())
  window.removeEventListener('entavi:tray-toggle-mute', onTrayToggleMute)
})
</script>

<template>
  <div class="container">
    <header>
      <h1>Entavi</h1>
      <p class="subtitle">Peer-to-peer voice calls</p>
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
  </div>
</template>
