import { getEngine } from '../engine'
import type { AudioDevice } from '@shared/types'

// Named useTauri so imports from shared components work via Vite alias
export function useTauri() {
  const engine = getEngine()

  async function createRoom(roomName: string, name: string, password: string | null): Promise<string> {
    return engine.createRoom(roomName, name, password)
  }

  async function joinRoom(roomId: string, name: string, password: string | null): Promise<void> {
    return engine.joinRoom(roomId, name, password)
  }

  async function leaveRoom(): Promise<void> {
    engine.leaveRoom()
  }

  async function setMuted(muted: boolean): Promise<void> {
    engine.setMuted(muted)
  }

  async function lockRoom(password: string | null): Promise<void> {
    engine.lockRoom(password)
  }

  async function kickPeer(peerId: string): Promise<void> {
    engine.kickPeer(peerId)
  }

  async function forceMutePeer(peerId: string): Promise<void> {
    engine.forceMutePeer(peerId)
  }

  async function listInputDevices(): Promise<AudioDevice[]> {
    return engine.listInputDevices()
  }

  async function setInputDevice(deviceName: string | null): Promise<void> {
    return engine.setInputDevice(deviceName)
  }

  async function setSignalingUrl(url: string | null): Promise<void> {
    engine.setSignalingUrl(url)
  }

  async function startMicTest(): Promise<void> {
    return engine.startMicTest()
  }

  async function stopMicTest(): Promise<void> {
    engine.stopMicTest()
  }

  async function setNoiseSuppression(enabled: boolean): Promise<void> {
    engine.setNoiseSuppression(enabled)
  }

  async function sendChatMessage(content: string): Promise<void> {
    engine.sendMessage(content)
  }

  async function showNotification(title: string, body: string): Promise<void> {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body })
    } else if ('Notification' in window && Notification.permission !== 'denied') {
      const perm = await Notification.requestPermission()
      if (perm === 'granted') {
        new Notification(title, { body })
      }
    }
  }

  async function checkForUpdates(): Promise<void> {
    // No-op for web
  }

  async function emitMuteState(muted: boolean): Promise<void> {
    engine.broadcastMuteState(muted)
  }

  return {
    createRoom,
    joinRoom,
    leaveRoom,
    setMuted,
    lockRoom,
    kickPeer,
    forceMutePeer,
    listInputDevices,
    setInputDevice,
    setSignalingUrl,
    startMicTest,
    stopMicTest,
    setNoiseSuppression,
    sendChatMessage,
    showNotification,
    checkForUpdates,
    emitMuteState,
  }
}
