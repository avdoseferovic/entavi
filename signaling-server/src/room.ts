import { DurableObject } from "cloudflare:workers";

interface JoinMessage {
  type: "join";
  room_id: string;
  peer_id: string;
  name: string;
  password?: string;
}

interface SignalMessage {
  type: "signal";
  to: string;
  payload: unknown;
}

interface KickMessage {
  type: "kick";
  peer_id: string;
}

interface ForceMuteMessage {
  type: "force_mute";
  peer_id: string;
}

interface LeaveMessage {
  type: "leave";
  room_id: string;
  peer_id: string;
}

interface LockRoomMessage {
  type: "lock_room";
  password: string | null;
}

type IncomingMessage =
  | JoinMessage
  | LeaveMessage
  | SignalMessage
  | KickMessage
  | ForceMuteMessage
  | LockRoomMessage;

interface Attachment {
  peerId: string;
  name: string;
  isHost: boolean;
  roomPassword: string;
}

export class Room extends DurableObject {
  // ── Hibernation-safe helpers ──
  // Class fields are lost on hibernation, so we derive all state from
  // WebSocket attachments which survive hibernation.

  private getHostPeerId(): string | null {
    for (const sock of this.ctx.getWebSockets()) {
      const att = sock.deserializeAttachment() as Attachment | null;
      if (att?.isHost) return att.peerId;
    }
    return null;
  }

  private getRoomPassword(): string {
    for (const sock of this.ctx.getWebSockets()) {
      const att = sock.deserializeAttachment() as Attachment | null;
      if (att) return att.roomPassword;
    }
    return "";
  }

  private isLocked(): boolean {
    return this.getRoomPassword() !== "";
  }

  private setPassword(password: string): void {
    for (const sock of this.ctx.getWebSockets()) {
      const att = sock.deserializeAttachment() as Attachment | null;
      if (att) {
        att.roomPassword = password;
        sock.serializeAttachment(att);
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);

    // Auto-respond to pings without waking the hibernated DO
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong")
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer
  ): Promise<void> {
    if (typeof message !== "string") return;

    let msg: IncomingMessage;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    switch (msg.type) {
      case "join": {
        // Reject if room is password-protected and password doesn't match
        const storedPassword = this.getRoomPassword();
        if (storedPassword !== "" && msg.password !== storedPassword) {
          ws.send(JSON.stringify({ type: "room_locked_error" }));
          return;
        }

        // Determine if this peer is the host (first to join)
        const isHost = this.getHostPeerId() === null;
        const locked = this.isLocked();

        // Attach peer ID, name, host flag, and password to this websocket (hibernation-safe)
        ws.serializeAttachment({
          peerId: msg.peer_id,
          name: msg.name,
          isHost,
          roomPassword: storedPassword,
        } satisfies Attachment);

        // Collect existing peers as {peer_id, name}
        const peers: { peer_id: string; name: string }[] = [];
        for (const sock of this.ctx.getWebSockets()) {
          if (sock === ws) continue;
          const att = sock.deserializeAttachment() as Attachment | null;
          if (att?.peerId) peers.push({ peer_id: att.peerId, name: att.name });
        }

        // Send room_joined to the new peer
        ws.send(
          JSON.stringify({
            type: "room_joined",
            room_id: msg.room_id,
            peers,
            is_host: isHost,
            locked,
          })
        );

        // Broadcast peer_joined to existing peers (include name)
        const joinedMsg = JSON.stringify({
          type: "peer_joined",
          peer_id: msg.peer_id,
          name: msg.name,
        });
        for (const sock of this.ctx.getWebSockets()) {
          if (sock === ws) continue;
          const att = sock.deserializeAttachment() as Attachment | null;
          if (att?.peerId) {
            sock.send(joinedMsg);
          }
        }
        break;
      }

      case "leave": {
        this.handleDisconnect(ws);
        ws.close(1000, "Client left");
        break;
      }

      case "signal": {
        const att = ws.deserializeAttachment() as Attachment | null;
        if (!att?.peerId) return;

        const signalMsg = JSON.stringify({
          type: "signal",
          from: att.peerId,
          payload: msg.payload,
        });

        // Find the target peer and relay
        for (const sock of this.ctx.getWebSockets()) {
          const sockAtt = sock.deserializeAttachment() as Attachment | null;
          if (sockAtt?.peerId === msg.to) {
            sock.send(signalMsg);
            break;
          }
        }
        break;
      }

      case "kick": {
        const att = ws.deserializeAttachment() as Attachment | null;
        if (!att?.isHost) return;

        for (const sock of this.ctx.getWebSockets()) {
          const sockAtt = sock.deserializeAttachment() as Attachment | null;
          if (sockAtt?.peerId === msg.peer_id) {
            sock.send(JSON.stringify({ type: "kicked" }));
            // Broadcast peer_left to everyone else
            const leftMsg = JSON.stringify({
              type: "peer_left",
              peer_id: msg.peer_id,
            });
            for (const other of this.ctx.getWebSockets()) {
              if (other === sock) continue;
              const otherAtt = other.deserializeAttachment() as Attachment | null;
              if (otherAtt?.peerId) {
                try {
                  other.send(leftMsg);
                } catch {
                  // Socket already closed
                }
              }
            }
            sock.close(4000, "Kicked by host");
            break;
          }
        }
        break;
      }

      case "force_mute": {
        const att = ws.deserializeAttachment() as Attachment | null;
        if (!att?.isHost) return;

        for (const sock of this.ctx.getWebSockets()) {
          const sockAtt = sock.deserializeAttachment() as Attachment | null;
          if (sockAtt?.peerId === msg.peer_id) {
            sock.send(JSON.stringify({ type: "force_muted" }));
            break;
          }
        }
        break;
      }

      case "lock_room": {
        const att = ws.deserializeAttachment() as Attachment | null;
        if (!att?.isHost) return;

        const newPassword = msg.password ?? "";
        this.setPassword(newPassword);

        // Broadcast room_locked to all peers (locked = password is set)
        const lockMsg = JSON.stringify({
          type: "room_locked",
          locked: newPassword !== "",
        });
        for (const sock of this.ctx.getWebSockets()) {
          const sockAtt = sock.deserializeAttachment() as Attachment | null;
          if (sockAtt?.peerId) {
            try {
              sock.send(lockMsg);
            } catch {
              // Socket already closed
            }
          }
        }
        break;
      }
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ): Promise<void> {
    this.handleDisconnect(ws);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    this.handleDisconnect(ws);
  }

  private handleDisconnect(ws: WebSocket): void {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att?.peerId) return;

    // If the host disconnects, clear the room password
    if (att.isHost) {
      this.setPassword("");
    }

    const leftMsg = JSON.stringify({
      type: "peer_left",
      peer_id: att.peerId,
    });

    for (const sock of this.ctx.getWebSockets()) {
      if (sock === ws) continue;
      try {
        sock.send(leftMsg);
      } catch {
        // Socket already closed
      }
    }
  }
}
