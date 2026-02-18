type Listener = (data: unknown) => void

export class SignalingClient {
  private ws: WebSocket | null = null
  private listeners = new Map<string, Set<Listener>>()
  private pingInterval: ReturnType<typeof setInterval> | null = null
  private lastPingSent = 0

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        this.startPing()
        resolve()
      }

      this.ws.onerror = () => {
        reject(new Error('WebSocket connection failed'))
      }

      this.ws.onclose = () => {
        this.stopPing()
        this.emit('close', undefined)
      }

      this.ws.onmessage = (event) => {
        const raw = event.data as string

        if (raw === 'pong') {
          const rtt = Date.now() - this.lastPingSent
          this.emit('pong', rtt)
          return
        }

        try {
          const msg = JSON.parse(raw)
          this.emit('message', msg)
        } catch {
          console.warn('Failed to parse signaling message:', raw)
        }
      }
    })
  }

  send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  disconnect(): void {
    this.stopPing()
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
  }

  on(event: string, fn: Listener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(fn)
  }

  off(event: string, fn: Listener): void {
    this.listeners.get(event)?.delete(fn)
  }

  removeAllListeners(): void {
    this.listeners.clear()
  }

  private emit(event: string, data: unknown): void {
    this.listeners.get(event)?.forEach((fn) => fn(data))
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.lastPingSent = Date.now()
        this.ws.send('ping')
      }
    }, 2000)
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }
}
