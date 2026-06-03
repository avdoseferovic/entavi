import { DurableObject } from "cloudflare:workers";

interface Env {
  METERED_API_KEY?: string;
}

interface TurnServer {
  urls: string[];
  username: string;
  credential: string;
}

interface JoinMessage {
  type: "join";
  room_id: string;
  peer_id: string;
  name: string;
  create?: boolean;
}

interface SignalMessage {
  type: "signal";
  to: string;
  payload: unknown;
}

interface LeaveMessage {
  type: "leave";
  room_id: string;
  peer_id: string;
}

interface MuteStateMessage {
  type: "mute_state";
  muted: boolean;
}

type IncomingMessage =
  | JoinMessage
  | LeaveMessage
  | SignalMessage
  | MuteStateMessage;

interface Attachment {
  peerId: string;
  name: string;
  // First peer to join "owns" the room - used only to detect that a room
  // exists (so later peers can join it). There is no host moderation.
  isOwner: boolean;
}

export class Room extends DurableObject<Env> {
  // ── Hibernation-safe helpers ──
  // Class fields are lost on hibernation, so we derive all state from
  // WebSocket attachments which survive hibernation.

  private roomExists(): boolean {
    for (const sock of this.ctx.getWebSockets()) {
      const att = sock.deserializeAttachment() as Attachment | null;
      if (att?.peerId) return true;
    }
    return false;
  }

  private async getTurnCredentials(): Promise<TurnServer[]> {
    const apiKey = this.env.METERED_API_KEY;
    if (!apiKey) return [];

    // Check cache (TTL: 5 minutes)
    const cached = await this.ctx.storage.get<{
      servers: TurnServer[];
      expires: number;
    }>("turn_cache");
    if (cached && cached.expires > Date.now()) {
      return cached.servers;
    }

    try {
      const resp = await fetch(
        `https://entavi.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`,
      );
      if (!resp.ok) {
        console.error("TURN credential fetch failed:", resp.status);
        return [];
      }
      const creds = (await resp.json()) as Array<{
        urls: string | string[];
        username: string;
        credential: string;
      }>;

      const servers: TurnServer[] = creds.map((c) => ({
        urls: Array.isArray(c.urls) ? c.urls : [c.urls],
        username: c.username || "",
        credential: c.credential || "",
      }));

      // Cache for 5 minutes
      await this.ctx.storage.put("turn_cache", {
        servers,
        expires: Date.now() + 5 * 60 * 1000,
      });

      return servers;
    } catch (e) {
      console.error("TURN credential fetch error:", e);
      return [];
    }
  }

  async fetch(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);

    // Auto-respond to pings without waking the hibernated DO
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
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
        const hasExistingPeers = this.roomExists();

        // If this is a join (not create) and no one is in the room, reject.
        // QR call codes are single-use: an expired/rotated code reads as not found.
        if (!msg.create && !hasExistingPeers) {
          ws.send(JSON.stringify({ type: "room_not_found" }));
          return;
        }

        // Check if this is a rejoin (peer reconnecting after disconnect)
        const pendingKey = `pending_leave:${msg.peer_id}`;
        const pendingLeave = await this.ctx.storage.get(pendingKey);
        if (pendingLeave) {
          // Cancel the pending leave - this is a rejoin
          await this.ctx.storage.delete(pendingKey);
        }

        // First peer to join owns the room (room-exists marker only).
        const isOwner = !hasExistingPeers;

        // Attach peer ID + name (hibernation-safe)
        ws.serializeAttachment({
          peerId: msg.peer_id,
          name: msg.name,
          isOwner,
        } satisfies Attachment);

        // Collect existing peers as {peer_id, name}
        const peers: { peer_id: string; name: string }[] = [];
        for (const sock of this.ctx.getWebSockets()) {
          if (sock === ws) continue;
          const att = sock.deserializeAttachment() as Attachment | null;
          if (att?.peerId) peers.push({ peer_id: att.peerId, name: att.name });
        }

        // Fetch TURN credentials
        const turnServers = await this.getTurnCredentials();

        // Send room_joined to the new peer
        ws.send(
          JSON.stringify({
            type: "room_joined",
            room_id: msg.room_id,
            peers,
            turn_servers: turnServers,
          }),
        );

        // Broadcast peer_joined to existing peers
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

      case "mute_state": {
        const att = ws.deserializeAttachment() as Attachment | null;
        if (!att?.peerId) return;

        const muteMsg = JSON.stringify({
          type: "peer_mute_state",
          peer_id: att.peerId,
          muted: msg.muted,
        });
        for (const sock of this.ctx.getWebSockets()) {
          if (sock === ws) continue;
          const sockAtt = sock.deserializeAttachment() as Attachment | null;
          if (sockAtt?.peerId) {
            try {
              sock.send(muteMsg);
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
    wasClean: boolean,
  ): Promise<void> {
    this.handleDisconnect(ws);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    this.handleDisconnect(ws);
  }

  private handleDisconnect(ws: WebSocket): void {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att?.peerId) return;

    // Store pending disconnect - give 15s grace period for reconnection
    this.ctx.storage.put(`pending_leave:${att.peerId}`, {
      peerId: att.peerId,
      timestamp: Date.now(),
    });

    // Set alarm for 15 seconds
    this.ctx.storage.setAlarm(Date.now() + 15_000);
  }

  async alarm(): Promise<void> {
    // Check all pending leaves
    const entries = await this.ctx.storage.list<{
      peerId: string;
      timestamp: number;
    }>({ prefix: "pending_leave:" });

    for (const [key, pending] of entries) {
      // Check if peer reconnected (has active WebSocket with same peerId)
      let reconnected = false;
      for (const sock of this.ctx.getWebSockets()) {
        const att = sock.deserializeAttachment() as Attachment | null;
        if (att?.peerId === pending.peerId) {
          reconnected = true;
          break;
        }
      }

      if (reconnected) {
        // Peer reconnected, cancel the pending leave
        await this.ctx.storage.delete(key);
        continue;
      }

      // Peer did not reconnect - broadcast peer_left
      const leftMsg = JSON.stringify({
        type: "peer_left",
        peer_id: pending.peerId,
      });

      for (const sock of this.ctx.getWebSockets()) {
        const att = sock.deserializeAttachment() as Attachment | null;
        if (att?.peerId) {
          try {
            sock.send(leftMsg);
          } catch {
            // Socket already closed
          }
        }
      }

      await this.ctx.storage.delete(key);
    }
  }
}
