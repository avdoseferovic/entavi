export type View = 'home' | 'create' | 'join' | 'room'

export interface CallState {
  state: 'idle' | 'connecting' | 'in_room' | 'error'
  room_id?: string
  room_name?: string
  is_host?: boolean
  locked?: boolean
  message?: string
}

export interface AudioDevice {
  name: string
  is_default: boolean
}

export interface PeerInfo {
  peer_id: string
  name: string
}
