<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useAppState } from '@shared/composables/useAppState'
import { useTauri } from './composables/useWeb'
import { setupListeners } from './composables/useWebEvents'
import { parseCode } from '@shared/lib/callcode'
import AppBar from '@shared/components/AppBar.vue'
import QrHomeView from '@shared/components/QrHomeView.vue'
import ScanView from '@shared/components/ScanView.vue'
import RoomView from '@shared/components/RoomView.vue'

const { state, resetRoomState, setStatus, getDisplayName } = useAppState()
const tauri = useTauri()

type UnlistenFn = () => void
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

watch(
  () => state.peerList.size,
  (n) => {
    if (n > 0 && state.currentView === 'home') {
      state.currentView = 'room'
      tauri.showNotification('Incoming call', 'Someone used your code - connecting securely')
    }
  },
)

watch(
  () => [state.currentView, state.roomCode] as const,
  ([view, code]) => {
    if (view === 'home' && !code && !hosting) hostNewCode()
  },
)

onMounted(async () => {
  const savedNoiseSuppression = localStorage.getItem('entavi:noiseSuppression')
  if (savedNoiseSuppression !== null) {
    state.noiseSuppression = savedNoiseSuppression !== 'false'
  }
  tauri.setNoiseSuppression(state.noiseSuppression)

  unlisteners = await setupListeners()

  hostNewCode()
})

onUnmounted(() => {
  unlisteners.forEach((fn) => fn())
})
</script>

<template>
  <div class="app-shell">
    <AppBar v-if="state.currentView !== 'room'" />

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

    <div v-if="endedToast" class="ended">
      <span class="lk"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
      Call ended · nothing was saved
    </div>
  </div>
</template>
