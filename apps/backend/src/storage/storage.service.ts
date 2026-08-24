import { Injectable } from '@nestjs/common';
import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requireEnv } from '../config/env';

/** Short TTL on purpose — these are one-shot links (upload-then-confirm, or fetch-and-view), not durable. */
const UPLOAD_URL_TTL_SECONDS = 5 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

/** S3-compatible client pointed at Cloudflare R2 — region "auto" + account-scoped endpoint, otherwise identical to S3. */
@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const accountId = requireEnv('R2_ACCOUNT_ID');
    this.bucket = requireEnv('R2_BUCKET_NAME');
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
        secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
      },
    });
  }

  /** Presigned PUT — browser uploads the file bytes directly to R2, server never sees them. */
  getUploadUrl(key: string, contentType: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );
  }

  /** Presigned GET — protected viewing without proxying bytes through the API. */
  getDownloadUrl(key: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
    );
  }

  /** Confirms an object landed in R2 and returns its real size/type — not trusted from the client. */
  async headObject(key: string): Promise<{ sizeBytes: number; contentType: string | null }> {
    const res = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return {
      sizeBytes: res.ContentLength ?? 0,
      contentType: res.ContentType ?? null,
    };
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /** Server-side read (not a presigned URL) — used to proxy an uploaded file to apps/ai directly. */
  async getObjectBytes(key: string): Promise<{ bytes: Buffer; contentType: string | null }> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return { bytes: Buffer.concat(chunks), contentType: res.ContentType ?? null };
  }
}
