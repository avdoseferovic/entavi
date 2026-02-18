import type { AudioDevice } from '@shared/types'

const VOICE_THRESHOLD = 0.01

export class AudioManager {
  private localStream: MediaStream | null = null
  private remoteElements = new Map<string, HTMLAudioElement>()
  private remoteStreams = new Map<string, MediaStream>()
  private audioCtx: AudioContext | null = null
  private localAnalyser: AnalyserNode | null = null
  private remoteAnalysers = new Map<string, AnalyserNode>()
  private micTestAnalyser: AnalyserNode | null = null
  private micTestStream: MediaStream | null = null

  async startCapture(deviceId?: string, noiseSuppression = true): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        noiseSuppression,
        echoCancellation: true,
        autoGainControl: true,
      },
    }
    this.localStream = await navigator.mediaDevices.getUserMedia(constraints)
    this.ensureAudioContext()
    const source = this.audioCtx!.createMediaStreamSource(this.localStream)
    this.localAnalyser = this.audioCtx!.createAnalyser()
    this.localAnalyser.fftSize = 256
    source.connect(this.localAnalyser)
    return this.localStream
  }

  stopCapture(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop())
      this.localStream = null
    }
    this.localAnalyser = null
  }

  getLocalStream(): MediaStream | null {
    return this.localStream
  }

  setMuted(muted: boolean): void {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((t) => {
        t.enabled = !muted
      })
    }
  }

  playRemoteStream(peerId: string, stream: MediaStream): void {
    this.stopRemoteStream(peerId)
    const audio = document.createElement('audio')
    audio.srcObject = stream
    audio.autoplay = true
    this.remoteElements.set(peerId, audio)
    this.remoteStreams.set(peerId, stream)

    this.ensureAudioContext()
    const source = this.audioCtx!.createMediaStreamSource(stream)
    const analyser = this.audioCtx!.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)
    this.remoteAnalysers.set(peerId, analyser)
  }

  stopRemoteStream(peerId: string): void {
    const el = this.remoteElements.get(peerId)
    if (el) {
      el.srcObject = null
      this.remoteElements.delete(peerId)
    }
    this.remoteStreams.delete(peerId)
    this.remoteAnalysers.delete(peerId)
  }

  stopAllRemote(): void {
    for (const peerId of [...this.remoteElements.keys()]) {
      this.stopRemoteStream(peerId)
    }
  }

  /** Returns which remote peers are speaking + whether self is speaking */
  getVoiceActivity(): { speaking: string[]; selfSpeaking: boolean } {
    const speaking: string[] = []

    for (const [peerId, analyser] of this.remoteAnalysers) {
      if (this.getLevel(analyser) > VOICE_THRESHOLD) {
        speaking.push(peerId)
      }
    }

    const selfSpeaking = this.localAnalyser
      ? this.getLevel(this.localAnalyser) > VOICE_THRESHOLD
      : false

    return { speaking, selfSpeaking }
  }

  async startMicTest(deviceId?: string, noiseSuppression = true): Promise<void> {
    const constraints: MediaStreamConstraints = {
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        noiseSuppression,
        echoCancellation: true,
        autoGainControl: true,
      },
    }
    this.micTestStream = await navigator.mediaDevices.getUserMedia(constraints)
    this.ensureAudioContext()
    const source = this.audioCtx!.createMediaStreamSource(this.micTestStream)
    this.micTestAnalyser = this.audioCtx!.createAnalyser()
    this.micTestAnalyser.fftSize = 256
    source.connect(this.micTestAnalyser)
  }

  stopMicTest(): void {
    if (this.micTestStream) {
      this.micTestStream.getTracks().forEach((t) => t.stop())
      this.micTestStream = null
    }
    this.micTestAnalyser = null
  }

  getMicTestLevel(): number {
    if (!this.micTestAnalyser) return 0
    return this.getLevel(this.micTestAnalyser)
  }

  async listDevices(): Promise<AudioDevice[]> {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices
      .filter((d) => d.kind === 'audioinput')
      .map((d, i) => ({
        name: d.label || `Microphone ${i + 1}`,
        is_default: d.deviceId === 'default',
      }))
  }

  async findDeviceId(name: string): Promise<string | undefined> {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const match = devices.find((d) => d.kind === 'audioinput' && d.label === name)
    return match?.deviceId
  }

  private ensureAudioContext(): void {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      this.audioCtx = new AudioContext()
    }
  }

  private getLevel(analyser: AnalyserNode): number {
    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteTimeDomainData(data)
    let max = 0
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i] - 128) / 128
      if (v > max) max = v
    }
    return max
  }
}
