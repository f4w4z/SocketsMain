// presence.ts
// Implements a simple presence system using Firebase Realtime Database
import { db } from './firebase';
import { sendDiscordNotification } from './utils/discord';
const webhookNewViewer = import.meta.env.VITE_WEBHOOK_NEW_VIEWER;
// const webhookUserLeft = import.meta.env.VITE_WEBHOOK_USER_LEFT_ROOM; // No longer needed
import { ref, onDisconnect, set, remove, onValue } from 'firebase/database';

export function joinPresence(roomId: string, onChange: (count: number) => void): () => void {
  const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const userRef = ref(db, `notepad/${roomId}/presence/${uid}`);
  set(userRef, true);
  // Record join time in localStorage
  const joinTimeKey = `socket_join_time_${roomId}_${uid}`;
  const joinTime = Date.now();
  localStorage.setItem(joinTimeKey, joinTime.toString());
  import('./utils/embeds').then(({ presenceEmbed }) => {
    const embed = presenceEmbed({
      roomId,
      event: 'join',
      time: new Date(joinTime),
    });
    sendDiscordNotification(webhookNewViewer, { embeds: [embed] });
  });
  onDisconnect(userRef).remove();

  const presenceRef = ref(db, `notepad/${roomId}/presence`);
  const unsub = onValue(presenceRef, (snap) => {
    const val = snap.val();
    const count = val ? Object.keys(val).length : 0;
    onChange(count);
  });

  // Cleanup function
  return () => {
    remove(userRef);
    unsub();
    // Retrieve join time and calculate session duration
    const joinTimeKey = `socket_join_time_${roomId}_${uid}`;
    const joinTimeStr = localStorage.getItem(joinTimeKey);
    let joinTime = joinTimeStr ? parseInt(joinTimeStr) : null;
    let leftTime = Date.now();
    let durationStr = '';
    if (joinTime) {
      const durationMs = leftTime - joinTime;
      const h = Math.floor(durationMs / 3600000);
      const m = Math.floor((durationMs % 3600000) / 60000);
      const s = Math.floor((durationMs % 60000) / 1000);
      durationStr = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    }
    import('./utils/embeds').then(({ presenceEmbed }) => {
      const embed = presenceEmbed({
        roomId,
        event: 'leave',
        time: new Date(leftTime),
        joinTime: joinTime ? new Date(joinTime) : undefined,
        duration: durationStr || undefined,
      });
      // Always POST to /api/user-left (serverless function)
      const apiEndpoint = '/api/user-left';
      const payload = { embeds: [embed] };
      // Use fetch with keepalive for reliability
      fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      })
        .then(async (res) => {
          let text = '';
          try { text = await res.text(); } catch {}
          console.log('[Presence Leave] Serverless response:', res.status, text);
        })
        .catch((err) => {
          if (typeof window !== 'undefined') {
            if (window.location.hostname === 'localhost') {
              console.error('Serverless presence leave webhook failed:', err);
            }
          }
        });
      // Add a small delay to allow the request to be sent before cleanup
      const start = Date.now();
      const delay = 150; // ms
      while (Date.now() - start < delay) {
        // Busy-wait
      }
    });
    // Cleanup join time from localStorage
    localStorage.removeItem(joinTimeKey);
  };

}

// For admin dashboard: get presence count for a room
export function subscribePresence(roomId: string, onChange: (count: number) => void): () => void {
  const presenceRef = ref(db, `notepad/${roomId}/presence`);
  const unsub = onValue(presenceRef, (snap) => {
    const val = snap.val();
    const count = val ? Object.keys(val).length : 0;
    onChange(count);
  });
  return unsub;
}
