import type { CallState, PeerInfo, VoiceActivityEvent, PeerMuteEvent, ChatMessage } from '@shared/types'
import { useAppState } from '@shared/composables/useAppState'
import { useTauri } from './useWeb'
import { getEngine } from '../engine'

type UnlistenFn = () => void

// Named setupListeners so imports from shared components work via Vite alias
export async function setupListeners(): Promise<UnlistenFn[]> {
  const { state, setStatus } = useAppState()
  const { emitMuteState, showNotification } = useTauri()
  const engine = getEngine()

  const unlisteners: UnlistenFn[] = []

  unlisteners.push(
    engine.on('state-changed', (payload: unknown) => {
      const s = payload as CallState
      switch (s.state) {
        case 'idle':
          break
        case 'connecting':
          setStatus('Connecting...', 'connecting')
          break
        case 'in_room':
          setStatus('Connected', 'connected')
          if (s.is_host !== undefined) {
            state.isHost = s.is_host
          }
          if (s.locked !== undefined) {
            state.isRoomLocked = s.locked
          }
          // Switch to room view when server confirms join
          if (state.isJoining) {
            state.isJoining = false
            state.currentView = 'room'
            showNotification('Joined Room', `Code: ${state.roomCode}`)
          }
          break
        case 'error':
          state.isJoining = false
          if (s.message === 'Room is password-protected') {
            state.joinPasswordNeeded = true
            state.currentView = 'join'
          } else if (s.message === 'Room not found') {
            state.roomNotFound = true
            state.currentView = 'join'
          } else {
            setStatus(s.message ?? 'An error occurred', 'error')
          }
          break
      }
    })
  )

  unlisteners.push(
    engine.on('peer-joined', (payload: unknown) => {
      const { peer_id, name, is_host } = payload as PeerInfo
      console.log('Peer joined:', payload)
      if (!state.peerList.has(peer_id)) {
        state.peerList.set(peer_id, name)
        state.peerList = new Map(state.peerList)
      }
      if (is_host) {
        state.hostPeerId = peer_id
      }
    })
  )

  unlisteners.push(
    engine.on('peer-left', (peerId: unknown) => {
      const id = peerId as string
      console.log('Peer left:', id)
      state.peerList.delete(id)
      state.peerList = new Map(state.peerList)
      state.mutedPeers.delete(id)
      state.mutedPeers = new Set(state.mutedPeers)
      state.speakingPeers.delete(id)
      state.speakingPeers = new Set(state.speakingPeers)
      if (state.hostPeerId === id) {
        state.hostPeerId = null
      }
    })
  )

  unlisteners.push(
    engine.on('error', (message: unknown) => {
      console.error('Engine error:', message)
      setStatus(message as string, 'error')
    })
  )

  unlisteners.push(
    engine.on('kicked', () => {
      state.currentView = 'home'
      showNotification('Kicked', 'You were removed from the room by the host')
      state.roomCode = null
      state.roomName = null
      state.isMuted = false
      state.isHost = false
      state.isRoomLocked = false
      state.peerList = new Map()
      state.noticeBannerVisible = false
      emitMuteState(false)
    })
  )

  unlisteners.push(
    engine.on('force-muted', () => {
      state.isMuted = true
      emitMuteState(true)
      state.noticeBannerVisible = true
      setTimeout(() => {
        state.noticeBannerVisible = false
      }, 3000)
    })
  )

  unlisteners.push(
    engine.on('room-locked', (locked: unknown) => {
      state.isRoomLocked = locked as boolean
    })
  )

  unlisteners.push(
    engine.on('ping-update', (rtt: unknown) => {
      state.pingMs = rtt as number
    })
  )

  unlisteners.push(
    engine.on('voice-activity', (payload: unknown) => {
      const { speaking, self_speaking } = payload as VoiceActivityEvent
      state.selfSpeaking = self_speaking
      state.speakingPeers = new Set(speaking)
    })
  )

  unlisteners.push(
    engine.on('mic-test-level', (level: unknown) => {
      state.micTestLevel = level as number
    })
  )

  unlisteners.push(
    engine.on('chat-message', (payload: unknown) => {
      const msg = payload as ChatMessage
      state.messages.push(msg)
      if (state.activeRoomTab !== 'chat') {
        state.chatUnread++
      }
    })
  )

  unlisteners.push(
    engine.on('peer-mute-changed', (payload: unknown) => {
      const { peer_id, muted } = payload as PeerMuteEvent
      if (muted) {
        state.mutedPeers.add(peer_id)
      } else {
        state.mutedPeers.delete(peer_id)
      }
      state.mutedPeers = new Set(state.mutedPeers)
    })
  )

  return unlisteners
}
