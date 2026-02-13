import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import type { AudioDevice } from '../types'

export function useTauri() {
  async function createRoom(roomName: string, name: string, password: string | null) {
    return invoke<string>('create_room', { roomName, name, password })
  }

  async function joinRoom(roomId: string, name: string, password: string | null) {
    return invoke('join_room', { roomId, name, password })
  }

  async function leaveRoom() {
    return invoke('leave_room')
  }

  async function setMuted(muted: boolean) {
    return invoke('set_muted', { muted })
  }

  async function lockRoom(password: string | null) {
    return invoke('lock_room', { password })
  }

  async function kickPeer(peerId: string) {
    return invoke('kick_peer', { peerId })
  }

  async function forceMutePeer(peerId: string) {
    return invoke('force_mute_peer', { peerId })
  }

  async function listInputDevices() {
    return invoke<AudioDevice[]>('list_input_devices')
  }

  async function setInputDevice(deviceName: string | null) {
    return invoke('set_input_device', { deviceName })
  }

  async function setSignalingUrl(url: string | null) {
    return invoke('set_signaling_url', { url })
  }

  async function startMicTest() {
    return invoke('start_mic_test')
  }

  async function stopMicTest() {
    return invoke('stop_mic_test')
  }

  async function setNoiseSuppression(enabled: boolean) {
    return invoke('set_noise_suppression', { enabled })
  }

  async function showNotification(title: string, body: string) {
    try {
      await invoke('show_notification', { title, body })
    } catch (_) { /* ignore */ }
  }

  async function emitMuteState(muted: boolean) {
    await emit('mute-state-changed', muted ? 'muted' : 'unmuted')
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
    showNotification,
    emitMuteState,
  }
}
