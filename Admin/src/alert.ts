// alert.ts - shared alert logic for collaborative-notepad-admin (admin dashboard)
import { ref, onValue, set, off } from 'firebase/database';
import { db } from './firebase';

export interface LiveAlert {
  message: string;
  updatedAt: number;
}

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

export function updateAlert(roomId: string, message: string) {
  return set(ref(db, `notepad/${roomId}/alert`), {
    message,
    updatedAt: Date.now(),
  });
}

export function clearAlert(roomId: string) {
  return set(ref(db, `notepad/${roomId}/alert`), null);
}
