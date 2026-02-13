import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { CallState, PeerInfo, VoiceActivityEvent, PeerMuteEvent } from '../types'
import { useAppState } from './useAppState'
import { useTauri } from './useTauri'

export async function setupListeners(): Promise<UnlistenFn[]> {
  const { state, setStatus } = useAppState()
  const { emitMuteState, showNotification } = useTauri()

  const unlisteners: UnlistenFn[] = []

  unlisteners.push(
    await listen('tray-toggle-mute', async () => {
      // Handled by App.vue via a shared toggleMute function
      // We emit a custom DOM event so App.vue can call toggleMute
      window.dispatchEvent(new CustomEvent('entavi:tray-toggle-mute'))
    })
  )

  unlisteners.push(
    await listen<CallState>('state-changed', (event) => {
      const s = event.payload
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
    await listen<PeerInfo>('peer-joined', (event) => {
      console.log('Peer joined:', event.payload)
      const { peer_id, name, is_host } = event.payload
      if (!state.peerList.has(peer_id)) {
        state.peerList.set(peer_id, name)
        // Trigger reactivity by reassigning the map
        state.peerList = new Map(state.peerList)
      }
      if (is_host) {
        state.hostPeerId = peer_id
      }
    })
  )

  unlisteners.push(
    await listen<string>('peer-left', (event) => {
      console.log('Peer left:', event.payload)
      state.peerList.delete(event.payload)
      state.peerList = new Map(state.peerList)
      state.mutedPeers.delete(event.payload)
      state.mutedPeers = new Set(state.mutedPeers)
      state.speakingPeers.delete(event.payload)
      state.speakingPeers = new Set(state.speakingPeers)
      if (state.hostPeerId === event.payload) {
        state.hostPeerId = null
      }
    })
  )

  unlisteners.push(
    await listen<string>('error', (event) => {
      console.error('Engine error:', event.payload)
      setStatus(event.payload, 'error')
    })
  )

  unlisteners.push(
    await listen('kicked', () => {
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
    await listen('force-muted', () => {
      state.isMuted = true
      emitMuteState(true)
      state.noticeBannerVisible = true
      setTimeout(() => {
        state.noticeBannerVisible = false
      }, 3000)
    })
  )

  unlisteners.push(
    await listen<boolean>('room-locked', (event) => {
      state.isRoomLocked = event.payload
    })
  )

  unlisteners.push(
    await listen<number>('ping-update', (event) => {
      state.pingMs = event.payload
    })
  )

  unlisteners.push(
    await listen<VoiceActivityEvent>('voice-activity', (event) => {
      const { speaking, self_speaking } = event.payload
      state.selfSpeaking = self_speaking
      state.speakingPeers = new Set(speaking)
    })
  )

  unlisteners.push(
    await listen<number>('mic-test-level', (event) => {
      state.micTestLevel = event.payload
    })
  )

  unlisteners.push(
    await listen<PeerMuteEvent>('peer-mute-changed', (event) => {
      const { peer_id, muted } = event.payload
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
