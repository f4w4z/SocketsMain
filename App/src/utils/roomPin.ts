import { db } from '../firebase';
import { ref, set, get } from 'firebase/database';



export async function saveRoomPin(roomId: string, pin: string): Promise<void> {
  // Save the PIN as plain text in Realtime Database (matches admin dashboard logic)
  await set(ref(db, `notepad/${roomId}/pin`), pin);
}

export async function verifyRoomPin(roomId: string, candidatePin: string): Promise<boolean> {
  // Read PIN from Realtime Database
  const pinRef = ref(db, `notepad/${roomId}/pin`);
  const snap = await get(pinRef);
  // If no PIN is set, treat as no PIN required
  if (!snap.exists() || snap.val() === null || snap.val() === "") return true;
  return String(snap.val()) === candidatePin;
}
