// webrtc-listener.ts
// Handles receiving live WebRTC audio streams from user app via Firebase signaling

import { getDatabase, ref, onValue, push, set } from 'firebase/database';

export interface WebRTCListenerOptions {
  roomId: string;
  onStream: (stream: MediaStream) => void;
}

export class WebRTCListener {
  private pc: RTCPeerConnection;
  private db: ReturnType<typeof getDatabase>;
  private roomId: string;
  private onStream: (stream: MediaStream) => void;

  constructor(options: WebRTCListenerOptions) {
    this.roomId = options.roomId;
    this.onStream = options.onStream;
    this.db = getDatabase();
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
      ],
    });
    // Removed unused signalingRef to fix lint
    this.setupConnection();
  }

  private setupConnection() {
    // Log connection state changes
    this.pc.onconnectionstatechange = () => {
      console.log('[WebRTC-Admin] Connection state:', this.pc.connectionState);
    };
    this.pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC-Admin] ICE connection state:', this.pc.iceConnectionState);
    };
    this.pc.onicegatheringstatechange = () => {
      console.log('[WebRTC-Admin] ICE gathering state:', this.pc.iceGatheringState);
    };

    // Handle remote stream
    this.pc.ontrack = (event) => {
      console.log('[WebRTC-Admin] Received remote track:', event.streams[0]);
      this.onStream(event.streams[0]);
    };

    // Handle ICE candidates
    this.pc.onicecandidate = event => {
      if (event.candidate) {
        const candidate = event.candidate.toJSON();
        console.log('[WebRTC-Admin] Sending ICE candidate:', candidate);
        push(ref(this.db, `webrtc-signaling/${this.roomId}/candidates-answer`), candidate);
      } else {
        console.log('[WebRTC-Admin] ICE candidate gathering complete');
      }
    };
  }

  async start() {
    // Listen for offer from user (wait as long as needed)
    const offerRef = ref(this.db, `webrtc-signaling/${this.roomId}/offer`);
    onValue(offerRef, async snapshot => {
      const offer = snapshot.val();
      if (offer && this.pc.signalingState === 'stable') {
        console.log('[WebRTC-Admin] Received offer:', offer);
        // Clear pleaseSendOffer flag as soon as offer is received
        set(ref(this.db, `webrtc-signaling/${this.roomId}/pleaseSendOffer`), null);
        // Add audio transceiver before setting remote description
        if (this.pc.getTransceivers().length === 0) {
          this.pc.addTransceiver('audio', { direction: 'recvonly' });
          console.log('[WebRTC-Admin] Added audio transceiver with direction recvonly');
        }
        await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
        // Create and send answer
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        console.log('[WebRTC-Admin] Sending answer:', answer);
        await set(ref(this.db, `webrtc-signaling/${this.roomId}/answer`), answer);
      }
    });

    // Listen for ICE candidates from user
    onValue(ref(this.db, `webrtc-signaling/${this.roomId}/candidates-offer`), snapshot => {
      const candidates = snapshot.val();
      if (candidates) {
        Object.values(candidates).forEach((candidateObj: any) => {
          console.log('[WebRTC-Admin] Adding remote ICE candidate:', candidateObj);
          this.pc.addIceCandidate(new RTCIceCandidate(candidateObj));
        });
      }
    });
  }

  close() {
    this.pc.close();
    console.log('[WebRTC-Admin] Connection closed');
  }
}
