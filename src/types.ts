export type View = 'home' | 'create' | 'join' | 'room'

export interface CallState {
  state: 'idle' | 'connecting' | 'in_room' | 'reconnecting' | 'error'
  room_id?: string
  room_name?: string
  is_host?: boolean
  locked?: boolean
  attempt?: number
  message?: string
}

export interface AudioDevice {
  name: string
  is_default: boolean
}

export interface PeerInfo {
  peer_id: string
  name: string
  is_host?: boolean
}

export interface VoiceActivityEvent {
  speaking: string[]
  self_speaking: boolean
}

export interface PeerMuteEvent {
  peer_id: string
  muted: boolean
}

export interface ShortcutConfig {
  toggle_mute: string | null
  push_to_talk: string | null
}

export interface ChatMessage {
  id: string
  peer_id: string
  sender_name: string
  content: string
  timestamp: number
  is_self: boolean
}
