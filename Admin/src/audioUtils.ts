// Utility functions for admin dashboard audio playback
import { ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, r2Bucket } from "./r2";

/**
 * Lists all sessionIds for a given roomId (i.e., all subfolders under recordings/{roomId}/)
 */
export async function listSessionIds(roomId: string): Promise<string[]> {
  // List all sessionId folders under recordings/{roomId}/
  const prefix = `recordings/${roomId}/`;
  const command = new ListObjectsV2Command({
    Bucket: r2Bucket,
    Prefix: prefix,
    Delimiter: '/',
  });
  const res = await r2Client.send(command);
  // Extract unique sessionIds (subfolders)
  const sessionIds = new Set<string>();
  if (res.Contents) {
    for (const obj of res.Contents) {
      if (!obj.Key) continue;
      const match = obj.Key.replace(prefix, '').match(/^([^\/]+)\//);
      if (match) sessionIds.add(match[1]);
    }
  }
  if (res.CommonPrefixes) {
    for (const cp of res.CommonPrefixes) {
      if (cp.Prefix) {
        const sid = cp.Prefix.replace(prefix, '').replace(/\/$/, '');
        if (sid) sessionIds.add(sid);
      }
    }
  }
  return Array.from(sessionIds);
}

/**
 * Parses a sessionId (format: {timestamp}_{random}) and returns a Date object, or null if invalid.
 */
export function parseSessionIdDate(sessionId: string): Date | null {
  const ts = sessionId.split('_')[0];
  const ms = parseInt(ts, 10);
  if (!isNaN(ms)) return new Date(ms);
  return null;
}

/**
 * Returns a YYYY-MM-DD string from a Date object
 */
export function dateToYMD(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Returns a YYYY-MM-DD string from a Date object in LOCAL time
 */
export function dateToYMDLocal(date: Date): string {
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0');
}

/**
 * Returns a human-readable time (HH:mm:ss) from a Date object
 */
export function dateToTime(date: Date): string {
  return date.toTimeString().slice(0, 8);
}

/**
 * Groups sessionIds by date (YYYY-MM-DD)
 */
export function groupSessionIdsByDate(sessionIds: string[]): Record<string, {sessionId: string, time: string}[]> {
  const grouped: Record<string, {sessionId: string, time: string}[]> = {};
  for (const sid of sessionIds) {
    const dateObj = parseSessionIdDate(sid);
    if (!dateObj) continue;
    const ymd = dateToYMDLocal(dateObj); // Use local date for grouping
    const time = dateToTime(dateObj);
    if (!grouped[ymd]) grouped[ymd] = [];
    grouped[ymd].push({ sessionId: sid, time });
  }
  // Sort sessions by time within each date
  for (const ymd in grouped) {
    grouped[ymd].sort((a, b) => a.time.localeCompare(b.time));
  }
  return grouped;
}

/**
 * Returns session metadata: chunk count and estimated duration (seconds, mm:ss)
 */
import { getSessionDbMeta } from './sessionMetaUtils';

export async function getSessionMetadata(roomId: string, sessionId: string): Promise<{
  chunkCount: number,
  durationSec: number,
  durationStr: string,
  presentChunks: number[],
  missingChunks: number[],
  endTime?: number
}> {
  const prefix = `recordings/${roomId}/${sessionId}/`;
  const command = new ListObjectsV2Command({
    Bucket: r2Bucket,
    Prefix: prefix,
  });
  const res = await r2Client.send(command);
  // Extract chunk indices from filenames (e.g., 0.webm, 1.webm, ...)
  const indices = (res.Contents || [])
    .map(obj => {
      if (!obj.Key) return null;
      const fname = obj.Key.replace(prefix, '');
      const idx = parseInt(fname.split('.')[0], 10);
      return isNaN(idx) ? null : idx;
    })
    .filter(idx => idx !== null) as number[];
  indices.sort((a, b) => a - b);
  const chunkCount = indices.length;
  // Find missing chunks in the sequence (assume should be 0..max)
  const missingChunks: number[] = [];
  if (indices.length > 0) {
    const maxIdx = indices[indices.length - 1];
    for (let i = 0; i <= maxIdx; i++) {
      if (!indices.includes(i)) {
        missingChunks.push(i);
      }
    }
  }
  const durationSec = indices.length * 1; // 1s per chunk
  const mm = Math.floor(durationSec / 60).toString().padStart(2, '0');
  const ss = (durationSec % 60).toString().padStart(2, '0');
  const durationStr = `${mm}:${ss}`;
  // Fetch DB metadata (e.g., endTime)
  let endTime: number | undefined = undefined;
  try {
    const dbMeta = await getSessionDbMeta(roomId, sessionId);
    if (dbMeta && typeof dbMeta.endTime === 'number') endTime = dbMeta.endTime;
  } catch {}

  return {chunkCount, durationSec, durationStr, presentChunks: indices, missingChunks, endTime};
}

/**
 * Deletes all audio chunks in a session from Firebase Storage
 */
export async function deleteSession(roomId: string, sessionId: string): Promise<void> {
  const prefix = `recordings/${roomId}/${sessionId}/`;
  // List all objects under this prefix
  const command = new ListObjectsV2Command({
    Bucket: r2Bucket,
    Prefix: prefix,
  });
  const res = await r2Client.send(command);
  if (!res.Contents) return;
  await Promise.all(res.Contents.map(async obj => {
    if (!obj.Key) return;
    await r2Client.send(new DeleteObjectCommand({
      Bucket: r2Bucket,
      Key: obj.Key,
    }));
  }));
}

/**
 * Lists all chunk URLs for a given roomId and sessionId, sorted by chunk index
 */
export async function listAudioChunkUrls(roomId: string, sessionId: string): Promise<string[]> {
  const prefix = `recordings/${roomId}/${sessionId}/`;
  const command = new ListObjectsV2Command({
    Bucket: r2Bucket,
    Prefix: prefix,
  });
  const res = await r2Client.send(command);
  // Map to hold the best chunk per index
  const chunkMap: Record<number, { ext: string, key: string }> = {};
  for (const obj of res.Contents || []) {
    if (!obj.Key) continue;
    const fname = obj.Key.replace(prefix, '');
    const match = fname.match(/^(\d+)\.(wav|webm|pcm)$/);
    if (!match) {
      console.warn(`[AudioUtils] Skipping unexpected file: ${fname}`);
      continue;
    }
    const idx = parseInt(match[1], 10);
    const ext = match[2];
    // Prefer .wav > .webm > .pcm
    if (!chunkMap[idx] ||
      (chunkMap[idx].ext !== 'wav' && ext === 'wav') ||
      (chunkMap[idx].ext !== 'wav' && chunkMap[idx].ext !== 'webm' && ext === 'webm')) {
      chunkMap[idx] = { ext, key: obj.Key };
    }
  }
  // Sort by index
  const sorted = Object.entries(chunkMap)
    .map(([idx, { key }]) => ({ idx: parseInt(idx, 10), key }))
    .sort((a, b) => a.idx - b.idx);
  // Generate public URLs for each chunk (assume bucket is public or use signed URLs if needed)
  const urls = sorted.map(({ key }) => `${import.meta.env.VITE_R2_PUBLIC_URL}/${key}`);
  if (typeof window !== 'undefined') {
    console.log('[AudioUtils] Using chunks:', sorted.map(({ idx, key }) => `${idx}.${key.split('.').pop()}`));
  }
  return urls;
}

/**
 * Fetches and stitches all audio chunks into a single Blob URL for playback, batching requests to avoid resource exhaustion.
 * @param roomId
 * @param sessionId
 * @param onProgress Optional callback: (loadedChunks, totalChunks) => void
 */
export async function fetchAndStitchAudio(
  roomId: string,
  sessionId: string,
  onProgress?: (loaded: number, total: number) => void,
  batchSize: number = 10
): Promise<string> {
  let urls = await listAudioChunkUrls(roomId, sessionId);
  // Remove duplicates and ensure order
  urls = Array.from(new Set(urls));
  // Sort by chunk index (extract from filename)
  urls.sort((a, b) => {
    const getIdx = (url: string) => {
      const match = url.match(/(\d+)\.(webm|wav|pcm)/);
      return match ? parseInt(match[1], 10) : 0;
    };
    return getIdx(a) - getIdx(b);
  });
  if (onProgress) onProgress(0, urls.length);
  const blobs: Blob[] = new Array(urls.length);
  let loaded = 0;
  const BATCH_SIZE = batchSize;
  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE).map((url, idx) => {
      const realIdx = i + idx;
      return fetch(url)
        .then(resp => resp.ok ? resp.blob() : null)
        .then(blob => { if (blob) blobs[realIdx] = blob; })
        .catch(() => { blobs[realIdx] = undefined as any; });
    });
    await Promise.all(batch);
    loaded = Math.min(i + BATCH_SIZE, urls.length);
    if (onProgress) onProgress(loaded, urls.length);
  }
  // Filter out any undefined or empty blobs
  const validBlobs = blobs.filter(blob => blob && blob.size > 0);
  // Detect extension from the first chunk URL
  let mimeType = 'audio/webm';
  if (urls.length > 0) {
    const ext = urls[0].split('.').pop()?.toLowerCase();
    if (ext === 'wav') mimeType = 'audio/wav';
    else if (ext === 'pcm') mimeType = 'audio/webm;codecs=pcm';
    else if (ext === 'webm') mimeType = 'audio/webm';
  }
  const stitched = new Blob(validBlobs, { type: mimeType });
  return URL.createObjectURL(stitched);
}
