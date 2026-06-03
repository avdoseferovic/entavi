const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export type IceCandidateCallback = (candidate: RTCIceCandidate) => void;
export type TrackCallback = (stream: MediaStream) => void;

export class WebPeer {
  readonly peerId: string;
  readonly pc: RTCPeerConnection;
  onIceCandidate: IceCandidateCallback | null = null;
  onRemoteTrack: TrackCallback | null = null;

  constructor(peerId: string) {
    this.peerId = peerId;
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.onIceCandidate) {
        this.onIceCandidate(event.candidate);
      }
    };

    this.pc.ontrack = (event) => {
      if (event.streams[0] && this.onRemoteTrack) {
        this.onRemoteTrack(event.streams[0]);
      }
    };
  }

  addLocalStream(stream: MediaStream): void {
    for (const track of stream.getAudioTracks()) {
      this.pc.addTrack(track, stream);
    }
  }

  async createOffer(): Promise<string> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer.sdp!;
  }

  async handleOffer(sdp: string): Promise<string> {
    await this.pc.setRemoteDescription(
      new RTCSessionDescription({ type: "offer", sdp }),
    );
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer.sdp!;
  }

  async handleAnswer(sdp: string): Promise<void> {
    await this.pc.setRemoteDescription(
      new RTCSessionDescription({ type: "answer", sdp }),
    );
  }

  async addIceCandidate(
    candidate: string,
    sdpMid: string | null,
    sdpMlineIndex: number | null,
  ): Promise<void> {
    await this.pc.addIceCandidate(
      new RTCIceCandidate({
        candidate,
        sdpMid: sdpMid ?? undefined,
        sdpMLineIndex: sdpMlineIndex ?? undefined,
      }),
    );
  }

  close(): void {
    this.pc.close();
  }
}
