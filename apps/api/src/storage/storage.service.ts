import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from '../config';

/** Penyimpanan objek S3-compatible (MinIO/S3). Bucket privat: berkas hanya dilayani lewat API setelah cek akses. */
@Injectable()
export class StorageService implements OnModuleInit {
  private log = new Logger('Storage');
  private client?: S3Client;
  private get s3() {
    return (this.client ??= new S3Client({
      region: config.s3.region, endpoint: config.s3.endpoint, forcePathStyle: !!config.s3.endpoint,
      credentials: { accessKeyId: config.s3.accessKey, secretAccessKey: config.s3.secretKey },
    }));
  }

  async onModuleInit() {
    try {
      try { await this.s3.send(new HeadBucketCommand({ Bucket: config.s3.bucket })); }
      catch { await this.s3.send(new CreateBucketCommand({ Bucket: config.s3.bucket })); }
    } catch (e: any) { this.log.warn(`Bucket belum siap: ${e?.message}. Upload akan gagal sampai S3 dikonfigurasi.`); }
  }

  async put(key: string, body: Uint8Array, contentType: string) {
    await this.s3.send(new PutObjectCommand({ Bucket: config.s3.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async get(key: string): Promise<Uint8Array> {
    const r = await this.s3.send(new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }));
    return r.Body!.transformToByteArray();
  }
}
