// alert.ts - shared alert logic for collaborative notepad (main app)
import { ref, onValue, set, off } from 'firebase/database';
import { db } from './firebase';

export interface LiveAlert {
  message: string;
  updatedAt: number; // unix ms
}

// Subscribe to live alert for a room
export function subscribeAlert(roomId: string, cb: (alert: LiveAlert|null) => void) {
  const alertRef = ref(db, `notepad/${roomId}/alert`);
  const handler = (snap: any) => {
    const val = snap.val();
    if (val && typeof val.message === 'string') {
      cb({ message: val.message, updatedAt: val.updatedAt||0 });
    } else {
      cb(null);
    }
  };
  onValue(alertRef, handler);
  return () => off(alertRef, 'value', handler);
}

// Set or update the alert for a room
export function updateAlert(roomId: string, message: string) {
  return set(ref(db, `notepad/${roomId}/alert`), {
    message,
    updatedAt: Date.now(),
  });
}

// Clear alert for a room
export function clearAlert(roomId: string) {
  return set(ref(db, `notepad/${roomId}/alert`), null);
}
