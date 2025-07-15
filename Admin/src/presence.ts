// presence.ts (admin side)
// Minimal presence subscription utility used by the admin dashboard.
// Keeps track of how many users are currently in a notepad room.

import { db } from './firebase';
import { ref, onValue } from 'firebase/database';

/**
 * Subscribe to the live presence count for a room.
 *
 * @param roomId   The Firebase room/document ID.
 * @param onChange Callback that receives the latest viewer count.
 * @returns        Unsubscribe function to stop listening.
 */
export function subscribePresence(
  roomId: string,
  onChange: (count: number) => void
): () => void {
  const presenceRef = ref(db, `notepad/${roomId}/presence`);
  const unsub = onValue(presenceRef, (snap) => {
    const val = snap.val();
    const count = val ? Object.keys(val).length : 0;
    onChange(count);
  });
  return unsub;
}
