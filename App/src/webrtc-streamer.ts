// webrtc-streamer.ts
// Handles WebRTC logic for live audio streaming from user to admin via Firebase signaling

import { getDatabase, ref, onValue, set, push } from 'firebase/database';

export interface WebRTCStreamerOptions {
  roomId: string;
  stream: MediaStream;
}

export class WebRTCStreamer {
  private pc: RTCPeerConnection;
  private db: ReturnType<typeof getDatabase>;
  private roomId: string;
  private stream: MediaStream;

  constructor(options: WebRTCStreamerOptions) {
    this.roomId = options.roomId;
    this.stream = options.stream;
    this.db = getDatabase();
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
      ],
    });
    // Removed unused signalingRef to fix lint
    this.setupConnection();
  }

  private async setupConnection() {
    // --- Robust signaling: cleanup old signaling state ---
    await set(ref(this.db, `webrtc-signaling/${this.roomId}`), null);
    console.log('[WebRTC] Cleared old signaling data');
    // Add audio transceiver for one-way audio (sendonly)
    const audioTracks = this.stream.getAudioTracks();
    if (audioTracks.length > 0) {
      this.pc.addTransceiver(audioTracks[0], { direction: 'sendonly', streams: [this.stream] });
      console.log('[WebRTC] Added audio transceiver with direction sendonly and track:', audioTracks[0]);
    } else {
      console.warn('[WebRTC] No audio tracks found in stream!');
    }

    // Log connection state changes
    this.pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', this.pc.connectionState);
    };
    this.pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE connection state:', this.pc.iceConnectionState);
    };
    this.pc.onicegatheringstatechange = () => {
      console.log('[WebRTC] ICE gathering state:', this.pc.iceGatheringState);
    };

    // Handle ICE candidates
    this.pc.onicecandidate = event => {
      if (event.candidate) {
        const candidate = event.candidate.toJSON();
        console.log('[WebRTC] Sending ICE candidate:', candidate);
        push(ref(this.db, `webrtc-signaling/${this.roomId}/candidates-offer`), candidate);
      } else {
        console.log('[WebRTC] ICE candidate gathering complete');
      }
    };
  }

  async start() {
    // Create and send offer
    const sendOffer = async () => {
      const offer = await this.pc.createOffer({ offerToReceiveAudio: false });
      await this.pc.setLocalDescription(offer);
      console.log('[WebRTC] Created offer:', offer);
      await set(ref(this.db, `webrtc-signaling/${this.roomId}/offer`), offer);
    };
    await sendOffer();

    // Listen for 'pleaseSendOffer' flag from admin
    onValue(ref(this.db, `webrtc-signaling/${this.roomId}/pleaseSendOffer`), async snapshot => {
      const please = snapshot.val();
      if (please) {
        console.log('[WebRTC] Received pleaseSendOffer from admin, resending offer');
        await sendOffer();
      }
    });

    // Listen for answer
    onValue(ref(this.db, `webrtc-signaling/${this.roomId}/answer`), async snapshot => {
      const answer = snapshot.val();
      if (answer && this.pc.signalingState === 'have-local-offer') {
        console.log('[WebRTC] Received answer:', answer);
        await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    // Listen for ICE candidates from admin
    onValue(ref(this.db, `webrtc-signaling/${this.roomId}/candidates-answer`), snapshot => {
      const candidates = snapshot.val();
      if (candidates) {
        Object.values(candidates).forEach((candidateObj: any) => {
          console.log('[WebRTC] Adding remote ICE candidate:', candidateObj);
          this.pc.addIceCandidate(new RTCIceCandidate(candidateObj));
        });
      }
    });
  }

  close() {
    this.pc.close();
    console.log('[WebRTC] Connection closed');
  }
}
