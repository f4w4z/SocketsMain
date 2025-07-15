import { ref, get } from 'firebase/database';
import { db } from './firebase';

/**
 * Fetches session metadata from Realtime Database (e.g., endTime)
 */
export async function getSessionDbMeta(roomId: string, sessionId: string): Promise<{ endTime?: number }> {
  const metaRef = ref(db, `notepad/${roomId}/sessions/${sessionId}`);
  const snap = await get(metaRef);
  if (snap.exists()) {
    return snap.val() || {};
  }
  return {};
}
