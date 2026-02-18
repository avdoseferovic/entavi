import { SignalingClient } from './signaling'
import { WebPeer } from './peer'
import { AudioManager } from './audio'
import type { AudioDevice } from '@shared/types'

const DEFAULT_SIGNALING_URL = 'wss://entavi-signaling.avdo.workers.dev/ws'

type Listener = (...args: unknown[]) => void

interface SignalPayloadMsg {
  kind: string
  sdp?: string
  candidate?: string
  sdp_mid?: string | null
  sdp_mline_index?: number | null
}

interface SignalMsg {
  type: string
  to?: string
  from?: string
  payload?: SignalPayloadMsg
  // room_joined fields
  room_id?: string
  peers?: Array<{ peer_id: string; name: string; is_host?: boolean }>
  is_host?: boolean
  locked?: boolean
  // peer_joined / peer_left
  peer_id?: string
  name?: string
  // peer_mute_state
  muted?: boolean
}

export class WebEngine {
  private signaling = new SignalingClient()
  private audio = new AudioManager()
  private peers = new Map<string, WebPeer>()
  private listeners = new Map<string, Set<Listener>>()

  private peerId = ''
  private roomId = ''
  private roomName = ''
  private displayName = ''
  private isHost = false
  private signalingUrl: string | null = null
  private selectedDeviceName: string | null = null
  private noiseSuppression = true

  private voiceInterval: ReturnType<typeof setInterval> | null = null
  private micTestInterval: ReturnType<typeof setInterval> | null = null
  private signalQueue = new Map<string, Promise<void>>()

  async createRoom(roomName: string, name: string, password: string | null): Promise<string> {
    this.peerId = crypto.randomUUID()
    this.roomId = this.peerId.substring(0, 6)
    this.roomName = roomName
    this.displayName = name
    const baseUrl = this.signalingUrl || DEFAULT_SIGNALING_URL
    const wsUrl = `${baseUrl}/${this.roomId}`

    await this.signaling.connect(wsUrl)
    this.setupSignalingListeners()

    this.signaling.send({
      type: 'join',
      room_id: this.roomId,
      peer_id: this.peerId,
      name,
      password: null,
      create: true,
    })

    // Start mic capture
    const deviceId = this.selectedDeviceName
      ? await this.audio.findDeviceId(this.selectedDeviceName)
      : undefined
    await this.audio.startCapture(deviceId, this.noiseSuppression)

    // If password provided, lock room after joining
    if (password) {
      // Small delay to ensure room is created on server
      setTimeout(() => {
        this.signaling.send({ type: 'lock_room', password })
      }, 200)
    }

    return this.roomId
  }

  async joinRoom(roomId: string, name: string, password: string | null): Promise<void> {
    this.peerId = crypto.randomUUID()
    this.roomId = roomId
    this.roomName = `Room ${roomId}`
    this.displayName = name
    const baseUrl = this.signalingUrl || DEFAULT_SIGNALING_URL
    const wsUrl = `${baseUrl}/${this.roomId}`

    await this.signaling.connect(wsUrl)
    this.setupSignalingListeners()

    this.signaling.send({
      type: 'join',
      room_id: this.roomId,
      peer_id: this.peerId,
      name,
      password,
      create: false,
    })

    // Start mic capture
    const deviceId = this.selectedDeviceName
      ? await this.audio.findDeviceId(this.selectedDeviceName)
      : undefined
    await this.audio.startCapture(deviceId, this.noiseSuppression)
  }

  leaveRoom(): void {
    this.signaling.send({
      type: 'leave',
      room_id: this.roomId,
      peer_id: this.peerId,
    })
    this.cleanup()
  }

  setMuted(muted: boolean): void {
    this.audio.setMuted(muted)
    this.signaling.send({ type: 'mute_state', muted })
  }

  lockRoom(password: string | null): void {
    this.signaling.send({ type: 'lock_room', password })
  }

  kickPeer(peerId: string): void {
    this.signaling.send({ type: 'kick', peer_id: peerId })
  }

  forceMutePeer(peerId: string): void {
    this.signaling.send({ type: 'force_mute', peer_id: peerId })
    // Optimistically update host UI — the target peer won't broadcast
    // mute_state back, so we emit locally so the mute indicator shows.
    this.emit('peer-mute-changed', { peer_id: peerId, muted: true })
  }

  async listInputDevices(): Promise<AudioDevice[]> {
    return this.audio.listDevices()
  }

  async setInputDevice(name: string | null): Promise<void> {
    this.selectedDeviceName = name
  }

  setSignalingUrl(url: string | null): void {
    this.signalingUrl = url
  }

  async startMicTest(): Promise<void> {
    const deviceId = this.selectedDeviceName
      ? await this.audio.findDeviceId(this.selectedDeviceName)
      : undefined
    await this.audio.startMicTest(deviceId, this.noiseSuppression)

    this.micTestInterval = setInterval(() => {
      const level = this.audio.getMicTestLevel()
      this.emit('mic-test-level', level)
    }, 16) // ~60Hz
  }

  stopMicTest(): void {
    if (this.micTestInterval) {
      clearInterval(this.micTestInterval)
      this.micTestInterval = null
    }
    this.audio.stopMicTest()
  }

  setNoiseSuppression(enabled: boolean): void {
    this.noiseSuppression = enabled
  }

  sendMessage(content: string): void {
    const json = JSON.stringify({ sender_name: this.displayName, content })

    for (const peer of this.peers.values()) {
      peer.sendChatMessage(json)
    }

    // Emit self-message to frontend
    this.emit('chat-message', {
      id: crypto.randomUUID(),
      peer_id: this.peerId,
      sender_name: this.displayName,
      content,
      timestamp: Date.now(),
      is_self: true,
    })
  }

  broadcastMuteState(muted: boolean): void {
    // In the web version, setMuted already sends mute_state to the server.
    // This is called from emitMuteState which in Tauri sends a local event.
    // No-op here since the signaling already handles it.
  }

  // ── Event emitter ──

  on(event: string, fn: Listener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(fn)
    return () => this.listeners.get(event)?.delete(fn)
  }

  private emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((fn) => fn(...args))
  }

  // ── Signaling message handling ──

  private setupSignalingListeners(): void {
    // Clear any stale listeners from a previous session
    this.signaling.removeAllListeners()

    this.signaling.on('message', (data) => this.handleMessage(data as SignalMsg))
    this.signaling.on('pong', (rtt) => this.emit('ping-update', rtt))
    this.signaling.on('close', () => {
      // If we're still in a room, it means unexpected disconnect
      if (this.roomId) {
        this.emit('error', 'Connection lost')
      }
    })
  }

  private async handleMessage(msg: SignalMsg): Promise<void> {
    switch (msg.type) {
      case 'room_joined': {
        this.isHost = msg.is_host ?? false
        const locked = msg.locked ?? false
        this.emit('state-changed', {
          state: 'in_room',
          room_id: this.roomId,
          room_name: this.roomName,
          is_host: this.isHost,
          locked,
        })

        // Emit peer-joined for each existing peer
        for (const peer of msg.peers ?? []) {
          this.emit('peer-joined', {
            peer_id: peer.peer_id,
            name: peer.name,
            is_host: peer.is_host,
          })
        }

        // As the joining peer, create offers to all existing peers
        for (const peer of msg.peers ?? []) {
          await this.createPeerAndOffer(peer.peer_id)
        }

        // Start voice activity polling
        this.startVoiceActivityPolling()
        break
      }

      case 'peer_joined': {
        this.emit('peer-joined', {
          peer_id: msg.peer_id,
          name: msg.name,
          is_host: msg.is_host,
        })
        // Don't create offer — wait for the new peer to send us one
        break
      }

      case 'peer_left': {
        const peerId = msg.peer_id!
        this.closePeer(peerId)
        this.emit('peer-left', peerId)
        break
      }

      case 'signal': {
        await this.handleSignal(msg)
        break
      }

      case 'kicked': {
        this.cleanup()
        this.emit('kicked', undefined)
        break
      }

      case 'force_muted': {
        this.audio.setMuted(true)
        // Broadcast mute state so other peers see the indicator update
        this.signaling.send({ type: 'mute_state', muted: true })
        this.emit('force-muted', undefined)
        break
      }

      case 'room_locked': {
        this.emit('room-locked', msg.locked)
        break
      }

      case 'room_locked_error': {
        this.cleanup()
        this.emit('state-changed', {
          state: 'error',
          message: 'Room is password-protected',
        })
        break
      }

      case 'room_not_found': {
        this.cleanup()
        this.emit('state-changed', {
          state: 'error',
          message: 'Room not found',
        })
        break
      }

      case 'peer_mute_state': {
        this.emit('peer-mute-changed', {
          peer_id: msg.peer_id,
          muted: msg.muted,
        })
        break
      }
    }
  }

  private async handleSignal(msg: SignalMsg): Promise<void> {
    const fromId = msg.from!
    const payload = msg.payload!

    // Serialize signal handling per peer to prevent concurrent
    // offer/answer operations racing on the same RTCPeerConnection.
    const prev = this.signalQueue.get(fromId) ?? Promise.resolve()
    const next = prev.then(() => this.processSignal(fromId, payload))
    this.signalQueue.set(fromId, next.catch(() => {}))
    await next
  }

  private async processSignal(fromId: string, payload: SignalPayloadMsg): Promise<void> {
    switch (payload.kind) {
      case 'offer': {
        // Existing peer receiving offer from new joiner.
        // If we already have a connection for this peer, close it first
        // to avoid calling handleOffer on a connection in stable state.
        let peer = this.peers.get(fromId)
        if (peer) {
          peer.close()
          this.peers.delete(fromId)
        }
        peer = this.createPeer(fromId)
        const answerSdp = await peer.handleOffer(payload.sdp!)
        this.signaling.send({
          type: 'signal',
          to: fromId,
          payload: { kind: 'answer', sdp: answerSdp },
        })
        break
      }

      case 'answer': {
        const peer = this.peers.get(fromId)
        if (peer) {
          await peer.handleAnswer(payload.sdp!)
        }
        break
      }

      case 'ice_candidate': {
        const peer = this.peers.get(fromId)
        if (peer) {
          await peer.addIceCandidate(
            payload.candidate!,
            payload.sdp_mid ?? null,
            payload.sdp_mline_index ?? null,
          )
        }
        break
      }
    }
  }

  private createPeer(remotePeerId: string): WebPeer {
    const peer = new WebPeer(remotePeerId)

    peer.onIceCandidate = (candidate) => {
      this.signaling.send({
        type: 'signal',
        to: remotePeerId,
        payload: {
          kind: 'ice_candidate',
          candidate: candidate.candidate,
          sdp_mid: candidate.sdpMid,
          sdp_mline_index: candidate.sdpMLineIndex,
        },
      })
    }

    peer.onRemoteTrack = (stream) => {
      this.audio.playRemoteStream(remotePeerId, stream)
    }

    peer.onChatMessage = (text: string) => {
      try {
        const parsed = JSON.parse(text)
        this.emit('chat-message', {
          id: crypto.randomUUID(),
          peer_id: remotePeerId,
          sender_name: parsed.sender_name ?? 'Unknown',
          content: parsed.content ?? '',
          timestamp: Date.now(),
          is_self: false,
        })
      } catch {
        // ignore malformed messages
      }
    }

    // Add local mic track
    const localStream = this.audio.getLocalStream()
    if (localStream) {
      peer.addLocalStream(localStream)
    }

    this.peers.set(remotePeerId, peer)
    return peer
  }

  private async createPeerAndOffer(remotePeerId: string): Promise<void> {
    const peer = this.createPeer(remotePeerId)
    peer.createDataChannel()
    const offerSdp = await peer.createOffer()
    this.signaling.send({
      type: 'signal',
      to: remotePeerId,
      payload: { kind: 'offer', sdp: offerSdp },
    })
  }

  private closePeer(peerId: string): void {
    const peer = this.peers.get(peerId)
    if (peer) {
      peer.close()
      this.peers.delete(peerId)
    }
    this.audio.stopRemoteStream(peerId)
  }

  private startVoiceActivityPolling(): void {
    this.voiceInterval = setInterval(() => {
      const { speaking, selfSpeaking } = this.audio.getVoiceActivity()
      this.emit('voice-activity', { speaking, self_speaking: selfSpeaking })
    }, 100)
  }

  private cleanup(): void {
    if (this.voiceInterval) {
      clearInterval(this.voiceInterval)
      this.voiceInterval = null
    }
    for (const [peerId] of this.peers) {
      this.closePeer(peerId)
    }
    this.peers.clear()
    this.signalQueue.clear()
    this.audio.stopCapture()
    this.audio.stopAllRemote()
    this.signaling.disconnect()
    this.roomId = ''
    this.displayName = ''
    this.isHost = false
  }
}

// Singleton
let engineInstance: WebEngine | null = null

export function getEngine(): WebEngine {
  if (!engineInstance) {
    engineInstance = new WebEngine()
  }
  return engineInstance
}
