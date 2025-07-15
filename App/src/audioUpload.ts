// Handles uploading audio chunks to R2 Storage with enhanced reliability
import { PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, r2Bucket } from "./r2";

/**
 * Uploads multiple audio chunks in parallel with enhanced reliability
 * @param {string} roomId - The session/room identifier
 * @param {string} sessionId - The session identifier
 * @param {Array<{chunk: Blob, idx: number}>} chunks - Array of chunks to upload
 * @returns {Promise<boolean>} Returns true if all chunks were uploaded successfully, false otherwise
 */
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const MAX_PARALLEL_UPLOADS = 5;

interface UploadProgress {
  totalChunks: number;
  completedChunks: number;
  failedChunks: number;
  retries: Map<number, number>;
}

const uploadProgress: Map<string, UploadProgress> = new Map();

/**
 * Validates if a chunk exists in R2 storage and has the correct size
 * @param {string} roomId - The room identifier
 * @param {string} sessionId - The session identifier
 * @param {number} idx - The chunk index
 * @param {Blob} chunk - The chunk to validate
 * @returns {Promise<boolean>} Returns true if validation passes, false otherwise
 */
async function validateChunkUpload(roomId: string, sessionId: string, idx: number, chunk: Blob): Promise<boolean> {
  const ext = chunk.type === 'audio/wav' ? 'wav' : 'webm';
  const chunkPath = `recordings/${roomId}/${sessionId}/${idx}.${ext}`;
  
  try {
    const headCommand = new HeadObjectCommand({
      Bucket: r2Bucket,
      Key: chunkPath,
    });
    const headResponse = await r2Client.send(headCommand);
    return headResponse.ContentLength === chunk.size;
  } catch (error) {
    console.warn(`Validation failed for chunk ${idx}:`, error);
    return false;
  }
}

/**
 * Uploads a single audio chunk with retry logic
 * @param {string} roomId - The room identifier
 * @param {string} sessionId - The session identifier
 * @param {Blob} chunk - The audio chunk to upload
 * @param {number} idx - The chunk index
 * @returns {Promise<boolean>} Returns true if upload succeeds, false otherwise
 */
async function uploadSingleChunk(roomId: string, sessionId: string, chunk: Blob, idx: number): Promise<boolean> {
  const progressKey = `${roomId}:${sessionId}`;
  let progress = uploadProgress.get(progressKey) || {
    totalChunks: 0,
    completedChunks: 0,
    failedChunks: 0,
    retries: new Map()
  };

  if (!uploadProgress.has(progressKey)) {
    progress.totalChunks = 1; // Will be updated when called with all chunks
    uploadProgress.set(progressKey, progress);
  }

  let retryCount = 0;
  while (retryCount < MAX_RETRIES) {
    try {
      const ext = chunk.type === 'audio/wav' ? 'wav' : 'webm';
      const chunkPath = `recordings/${roomId}/${sessionId}/${idx}.${ext}`;
      
      // Convert Blob to ArrayBuffer and then to Buffer for S3
      const arrayBuffer = await chunk.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);

      const putCommand = new PutObjectCommand({
        Bucket: r2Bucket,
        Key: chunkPath,
        Body: buffer,
        ContentType: chunk.type,
      });

      await r2Client.send(putCommand);
      
      // Validate the upload
      const isValid = await validateChunkUpload(roomId, sessionId, idx, chunk);
      if (!isValid) {
        throw new Error('Upload validation failed');
      }

      progress.completedChunks++;
      uploadProgress.set(progressKey, progress);
      console.log(`Successfully uploaded and validated chunk ${idx} for ${roomId}/${sessionId}`);
      return true;
    } catch (error) {
      retryCount++;
      progress.retries.set(idx, (progress.retries.get(idx) || 0) + 1);
      uploadProgress.set(progressKey, progress);

      if (retryCount >= MAX_RETRIES) {
        progress.failedChunks++;
        uploadProgress.set(progressKey, progress);
        console.error(`Failed to upload chunk ${idx} after ${MAX_RETRIES} retries`, error);
        return false;
      }
      
      console.warn(`Retrying upload of chunk ${idx} (attempt ${retryCount}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * retryCount));
    }
  }
  return false;
}

/**
 * Uploads a single audio chunk (backward compatibility)
 * @param {string} roomId - The room identifier
 * @param {string} sessionId - The session identifier
 * @param {Blob} chunk - The audio chunk to upload
 * @param {number} idx - The chunk index
 * @returns {Promise<boolean>} Returns true if upload succeeds, false otherwise
 */
export async function uploadAudioChunk(roomId: string, sessionId: string, chunk: Blob, idx: number): Promise<boolean> {
  return uploadSingleChunk(roomId, sessionId, chunk, idx);
}

/**
 * Uploads multiple audio chunks in parallel with enhanced reliability
 * @param {string} roomId - The room identifier
 * @param {string} sessionId - The session identifier
 * @param {Array<{chunk: Blob, idx: number}>} chunks - Array of chunks to upload
 * @returns {Promise<boolean>} Returns true if all chunks were uploaded successfully, false otherwise
 */
export async function uploadMultipleChunks(roomId: string, sessionId: string, chunks: Array<{chunk: Blob, idx: number}>): Promise<boolean> {
  const progressKey = `${roomId}:${sessionId}`;
  const progress = {
    totalChunks: chunks.length,
    completedChunks: 0,
    failedChunks: 0,
    retries: new Map()
  };
  uploadProgress.set(progressKey, progress);

  // Split chunks into batches for parallel processing
  const chunkBatches = [];
  for (let i = 0; i < chunks.length; i += MAX_PARALLEL_UPLOADS) {
    chunkBatches.push(chunks.slice(i, i + MAX_PARALLEL_UPLOADS));
  }

  for (const batch of chunkBatches) {
    const uploadPromises = batch.map(({ chunk, idx }) => 
      uploadSingleChunk(roomId, sessionId, chunk, idx)
    );
    
    await Promise.all(uploadPromises);
  }

  const finalProgress = uploadProgress.get(progressKey);
  if (finalProgress) {
    console.log(`Upload summary for ${roomId}/${sessionId}:`, {
      total: finalProgress.totalChunks,
      completed: finalProgress.completedChunks,
      failed: finalProgress.failedChunks,
      retries: Array.from(finalProgress.retries.entries())
    });
  }

  uploadProgress.delete(progressKey);
  return finalProgress?.failedChunks === 0;
}

