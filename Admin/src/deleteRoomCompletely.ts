import { ref, remove } from 'firebase/database';
import { db, storage } from './firebase';
import { listAll, deleteObject, ref as storageRef } from 'firebase/storage';
import { deleteSession } from './audioUtils';

/**
 * Deletes ALL data for a room from Firebase Realtime Database and Storage.
 * Removes:
 *   - notepad/{roomId} (notes, content, sessions, pin, presence, alert)
 *   - webrtc-signaling/{roomId} (signaling data)
 *   - recordings/{roomId}/ (all audio sessions/chunks)
 */
export async function deleteRoomCompletely(roomId: string): Promise<void> {
  // 1. Remove notepad/{roomId} (includes notes, content, pin, presence, alert, sessions)
  await remove(ref(db, `notepad/${roomId}`));

  // 2. Remove webrtc-signaling/{roomId}
  await remove(ref(db, `webrtc-signaling/${roomId}`));

  // 3. Remove all audio recordings under recordings/{roomId}/
  //    - List all sessionIds (folders), then delete all chunks in each session
  const recordingsBaseRef = storageRef(storage, `recordings/${roomId}`);
  const sessionFolders = await listAll(recordingsBaseRef);
  // Delete all files in each session
  await Promise.all(sessionFolders.prefixes.map(async (sessionRef) => {
    const sessionId = sessionRef.name;
    await deleteSession(roomId, sessionId);
  }));
  // Delete any loose files directly under recordings/{roomId}/ (shouldn't exist, but just in case)
  await Promise.all(sessionFolders.items.map(item => deleteObject(item)));
}
