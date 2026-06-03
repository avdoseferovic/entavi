export type View = "home" | "scan" | "room";

export interface CallState {
  state: "idle" | "connecting" | "in_room" | "reconnecting" | "error";
  room_id?: string;
  room_name?: string;
  attempt?: number;
  message?: string;
}

export interface AudioDevice {
  name: string;
  is_default: boolean;
}

export interface PeerInfo {
  peer_id: string;
  name: string;
}

export interface VoiceActivityEvent {
  speaking: string[];
  self_speaking: boolean;
}

export interface PeerMuteEvent {
  peer_id: string;
  muted: boolean;
}
