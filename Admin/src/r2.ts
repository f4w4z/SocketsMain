// Cloudflare R2 S3 Client Utility
// This file sets up and exports an S3 client for Cloudflare R2 using AWS SDK v3
import { S3Client } from "@aws-sdk/client-s3";

// These should be set in your environment (e.g., .env file or Vite env)
const R2_ACCESS_KEY_ID = import.meta.env.VITE_R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = import.meta.env.VITE_R2_SECRET_ACCESS_KEY;
const R2_ENDPOINT = import.meta.env.VITE_R2_ENDPOINT; // e.g. "https://<accountid>.r2.cloudflarestorage.com"
const R2_REGION = import.meta.env.VITE_R2_REGION || "auto";
const R2_BUCKET = import.meta.env.VITE_R2_BUCKET;
const R2_PUBLIC_DOMAIN = import.meta.env.VITE_R2_PUBLIC_DOMAIN; // e.g. "https://pub-abc123.r2.dev" or your custom domain

export const r2Config = {
  region: R2_REGION,
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true, // Required for R2
};

export const r2Bucket = R2_BUCKET;
export const r2PublicDomain = R2_PUBLIC_DOMAIN;

export const r2Client = new S3Client(r2Config);
