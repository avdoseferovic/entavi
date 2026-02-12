import { reactive, computed } from 'vue'
import type { View } from '../types'

const state = reactive({
  currentView: 'home' as View,
  displayName: '',
  roomName: null as string | null,
  roomCode: null as string | null,
  isMuted: false,
  selectedMic: null as string | null,
  isMicTesting: false,
  isHost: false,
  isRoomLocked: false,
  peerList: new Map<string, string>(),
  joinPasswordNeeded: false,
  statusText: 'Connecting...',
  statusState: 'connecting' as 'connecting' | 'connected' | 'error',
  noticeBannerVisible: false,
  copyFeedback: false,
})

const peerCount = computed(() => state.peerList.size + 1)
const peerCountLabel = computed(() =>
  peerCount.value === 1 ? '1 person' : `${peerCount.value} people`
)

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.substring(0, 2).toUpperCase()
}

function getDisplayName(): string {
  return state.displayName.trim() || 'Anonymous'
}

function resetRoomState() {
  state.roomCode = null
  state.roomName = null
  state.isMuted = false
  state.isHost = false
  state.isRoomLocked = false
  state.peerList = new Map()
  state.noticeBannerVisible = false
}

function setStatus(text: string, statusState: 'connecting' | 'connected' | 'error' = 'connecting') {
  state.statusText = text
  state.statusState = statusState
}

export function useAppState() {
  return {
    state,
    peerCount,
    peerCountLabel,
    getInitials,
    getDisplayName,
    resetRoomState,
    setStatus,
  }
}
