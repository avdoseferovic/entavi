<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useAppState } from '@shared/composables/useAppState'
import { useTauri } from './composables/useWeb'
import { setupListeners } from './composables/useWebEvents'
import HomeView from '@shared/components/HomeView.vue'
import CreateView from '@shared/components/CreateView.vue'
import JoinView from '@shared/components/JoinView.vue'
import RoomView from '@shared/components/RoomView.vue'

const { state, resetRoomState, setStatus, getDisplayName } = useAppState()
const tauri = useTauri()

type UnlistenFn = () => void
let unlisteners: UnlistenFn[] = []

// ── Draggable window ──
const windowEl = ref<HTMLElement | null>(null)
let dragging = false
let dragOffsetX = 0
let dragOffsetY = 0

function onTitleBarDown(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('.titlebar-btn')) return
  dragging = true
  const el = windowEl.value!
  const rect = el.getBoundingClientRect()
  dragOffsetX = e.clientX - rect.left
  dragOffsetY = e.clientY - rect.top
  // Switch from margin-based centering to explicit positioning
  el.style.margin = '0'
  el.style.inset = 'auto'
  el.style.left = `${rect.left}px`
  el.style.top = `${rect.top}px`
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragUp)
}

function onDragMove(e: MouseEvent) {
  if (!dragging || !windowEl.value) return
  windowEl.value.style.left = `${e.clientX - dragOffsetX}px`
  windowEl.value.style.top = `${e.clientY - dragOffsetY}px`
}

function onDragUp() {
  dragging = false
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragUp)
}

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

onMounted(async () => {
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

  unlisteners = await setupListeners()
})

onUnmounted(() => {
  unlisteners.forEach((fn) => fn())
})
</script>

<template>
  <div class="window-shell" ref="windowEl">
    <div class="titlebar" @mousedown="onTitleBarDown">
      <span class="titlebar-title">Entavi</span>
      <div class="titlebar-dots">
        <span class="dot dot-red" />
        <span class="dot dot-yellow" />
        <span class="dot dot-green" />
      </div>
    </div>
    <div class="window-body">
      <div class="container">
        <header v-if="state.currentView === 'home'">
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
    </div>
  </div>
</template>
