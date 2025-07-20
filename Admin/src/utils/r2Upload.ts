import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, r2Bucket, r2PublicDomain } from "../r2";

export async function uploadImageToR2(file: File, roomId: string): Promise<string> {
  if (!r2Bucket) {
    throw new Error('R2 bucket not configured');
  }

  // Generate unique filename with timestamp
  const timestamp = Date.now();
  const fileName = `${timestamp}_${file.name}`;
  const key = `notepad/${roomId}/images/${fileName}`;

  try {
    // Convert File to ArrayBuffer for browser compatibility
    const arrayBuffer = await file.arrayBuffer();
    
    // Upload to R2
    const command = new PutObjectCommand({
      Bucket: r2Bucket,
      Key: key,
      Body: new Uint8Array(arrayBuffer),
      ContentType: file.type,
    });

    await r2Client.send(command);

    // Return the public URL using configured domain or fallback
    let publicUrl: string;
    if (r2PublicDomain) {
      publicUrl = `${r2PublicDomain}/${key}`;
    } else {
      // Fallback to bucket-based URL (may not work without proper R2 public access)
      publicUrl = `https://${r2Bucket}.r2.dev/${key}`;
    }
    
    return publicUrl;
  } catch (error) {
    console.error('R2 upload error:', error);
    throw new Error('Failed to upload image to R2');
  }
}
