import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DbService, DbContext } from '../db/db.service';
import { StorageService } from './storage.service';
import { safeName, sniff } from './file-type';
import { config } from '../config';

export interface Actor { orgId: string; userId: string | null; name: string }

@Injectable()
export class AttachmentsService {
  constructor(private db: DbService, private store: StorageService) {}

  /** Validasi isi berkas, simpan ke S3, catat di wo_attachments + riwayat WO. Dipakai oleh web dan WhatsApp. */
  async save(ctx: DbContext, who: Actor, woId: string, data: Uint8Array, filename: string | undefined, via: 'web' | 'whatsapp', waMessageId?: string) {
    if (!data.length) throw new HttpException('Berkas kosong', HttpStatus.BAD_REQUEST);
    if (data.length > config.maxUploadBytes) throw new HttpException('Berkas melebihi 10 MB', HttpStatus.PAYLOAD_TOO_LARGE);
    const t = sniff(data);
    if (!t) throw new HttpException('Hanya JPEG, PNG, WebP, atau PDF yang diizinkan', HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    const name = safeName(filename, t.ext);
    return this.db.tx(ctx, async (c) => {
      const w = await c.query('select status from work_orders where id = $1', [woId]);
      if (!w.rows[0]) throw new HttpException('WO tidak ditemukan', HttpStatus.NOT_FOUND);
      if (['closed', 'rejected'].includes(w.rows[0].status)) throw new HttpException('WO sudah ditutup, lampiran tidak bisa ditambah', HttpStatus.UNPROCESSABLE_ENTITY);
      const key = `${who.orgId}/${woId}/${randomUUID()}.${t.ext}`;
      await this.store.put(key, data, t.mime);
      const r = await c.query(
        `insert into wo_attachments (org_id, wo_id, kind, s3_key, filename, mime, size_bytes, via, wa_message_id, uploaded_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id, kind, filename, mime, size_bytes as "sizeBytes", via, created_at as "createdAt"`,
        [who.orgId, woId, t.kind, key, name, t.mime, data.length, via, waMessageId ?? null, who.userId]);
      await c.query('insert into wo_logs (org_id, wo_id, actor_user_id, actor_text, text) values ($1,$2,$3,$4,$5)',
        [who.orgId, woId, who.userId, who.name, `Lampiran ditambahkan: ${name}${via === 'whatsapp' ? ' (via WhatsApp)' : ''}`]);
      return r.rows[0];
    });
  }

  async read(ctx: DbContext, id: string) {
    const row = await this.db.tx(ctx, async (c) => (await c.query('select s3_key, filename, mime from wo_attachments where id = $1', [id])).rows[0]);
    if (!row) throw new HttpException('Lampiran tidak ditemukan', HttpStatus.NOT_FOUND);
    return { ...row, data: await this.store.get(row.s3_key) };
  }
}
