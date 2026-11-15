import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DbService, DbContext } from '../db/db.service';
import { WhatsappService } from './whatsapp.service';
import { parseCommand, HELP_TEXT, WaCommand } from './command';
import { AttachmentsService } from '../storage/attachments.service';
import { config } from '../config';

interface Tech { id: string; org_id: string; plant_id: string; user_id: string | null; full_name: string; phone_e164: string; wa_opt_in: boolean }
const RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3 };

/**
 * Worker pemroses webhook WhatsApp (jalan di proses API; aman dengan beberapa replika berkat `for update skip locked`).
 * Pengenalan teknisi memakai role auth (hanya baca); semua perubahan WO memakai role aplikasi dengan konteks RLS teknisi tsb.
 */
@Injectable()
export class WhatsappProcessor implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('WaProcessor');
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(private db: DbService, private wa: WhatsappService, private att: AttachmentsService) {}

  onModuleInit() {
    if (!config.wa.appSecret) return; // WA tidak dikonfigurasi
    this.timer = setInterval(() => void this.tick(), 5000);
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async tick() {
    if (this.running) return;
    this.running = true;
    try { while ((await this.processBatch()) > 0) { /* kuras antrean */ } }
    catch (e: any) { this.log.error(`Batch gagal: ${e?.message}`); }
    finally { this.running = false; }
  }

  /** @returns jumlah event yang diproses */
  async processBatch(): Promise<number> {
    const c = await this.db.authPool.connect();
    try {
      await c.query('begin');
      const { rows } = await c.query('select id, payload from wa_webhook_events where processed_at is null order by id limit 20 for update skip locked');
      for (const ev of rows) {
        let error: string | null = null;
        try { await this.handlePayload(ev.payload); } catch (e: any) { error = String(e?.message ?? e).slice(0, 500); this.log.warn(`Event ${ev.id}: ${error}`); }
        await c.query('update wa_webhook_events set processed_at = now(), error = $2 where id = $1', [ev.id, error]);
      }
      await c.query('commit');
      return rows.length;
    } catch (e) { await c.query('rollback').catch(() => undefined); throw e; }
    finally { c.release(); }
  }

  private async handlePayload(p: any) {
    for (const entry of p?.entry ?? []) for (const ch of entry?.changes ?? []) {
      const v = ch?.value ?? {};
      for (const s of v.statuses ?? []) await this.handleStatus(s);
      for (const m of v.messages ?? []) await this.handleMessage(m);
    }
  }

  private async handleStatus(s: any) {
    const next = String(s?.status ?? '');
    if (!s?.id || !(next in RANK) && next !== 'failed') return;
    const { rows } = await this.db.authPool.query('select status from wa_messages where wa_message_id = $1 limit 1', [s.id]);
    const cur = rows[0]?.status as string | undefined;
    if (!cur) return;
    if (next !== 'failed' && (RANK[next] ?? 0) <= (RANK[cur] ?? 0)) return; // jangan mundur (read -> delivered)
    await this.db.authPool.query('update wa_messages set status = $2, status_at = now(), error_code = $3 where wa_message_id = $1',
      [s.id, next, next === 'failed' ? String(s.errors?.[0]?.code ?? '') || null : null]);
  }

  private async findTech(fromDigits: string): Promise<Tech | null> {
    const { rows } = await this.db.authPool.query(
      `select id, org_id, plant_id, user_id, full_name, phone_e164, wa_opt_in from technicians where phone_e164 = $1 and active`, ['+' + fromDigits]);
    return rows[0] ?? null;
  }

  private async handleMessage(m: any) {
    const from = String(m?.from ?? '');
    const tech = await this.findTech(from);
    if (!tech || !tech.wa_opt_in) return; // nomor tak dikenal / belum opt-in: abaikan tanpa membalas
    const ctx: DbContext = { orgId: tech.org_id, plantIds: [tech.plant_id], allPlants: false };
    const type = String(m.type ?? 'other');
    const body: string = type === 'text' ? String(m.text?.body ?? '') : String(m[type]?.caption ?? '');
    // idempotensi: simpan pesan masuk; bila id sudah ada, lewati
    const fresh = await this.db.tx(ctx, async (c) => (await c.query(
      `insert into wa_messages (org_id, direction, technician_id, wa_message_id, from_e164, msg_type, body, status)
       values ($1,'in',$2,$3,$4,$5,$6,'received') on conflict (org_id, wa_message_id) where wa_message_id is not null do nothing returning id`,
      [tech.org_id, tech.id, m.id, tech.phone_e164, ['text', 'image', 'document', 'audio', 'interactive', 'location'].includes(type) ? type : 'other', body.slice(0, 2000)])).rowCount);
    if (!fresh) return;
    if (type === 'image' || type === 'document') {
      await this.reply(ctx, tech, await this.saveMedia(ctx, tech, m, type, body));
      return;
    }
    if (type !== 'text') {
      await this.reply(ctx, tech, 'Jenis pesan ini belum didukung. Ketik BANTUAN untuk daftar perintah.');
      return;
    }
    await this.reply(ctx, tech, await this.run(ctx, tech, parseCommand(body)));
  }

  /** Foto/dokumen dari teknisi -> lampiran WO. WO ditentukan dari nomor di keterangan, atau satu-satunya tugas aktif. */
  private async saveMedia(ctx: DbContext, tech: Tech, m: any, type: 'image' | 'document', caption: string): Promise<string> {
    const code = /WO-[A-Z0-9]{1,10}-\d{4}-\d{4}/i.exec(caption)?.[0].toUpperCase();
    const target = await this.db.tx(ctx, async (c) => {
      const r = code
        ? await c.query(`select id, code from work_orders where code = $1 and technician_id = $2`, [code, tech.id])
        : await c.query(`select id, code from work_orders where technician_id = $1 and status in ('assigned','progress') order by created_at limit 2`, [tech.id]);
      return r.rows;
    });
    if (!target.length) return code ? `WO ${code} tidak ditemukan di tugas Anda.` : 'Tidak ada tugas aktif. Tulis nomor WO di keterangan foto.';
    if (target.length > 1) return 'Anda punya lebih dari satu tugas aktif. Kirim ulang foto dengan nomor WO di keterangan (contoh: WO-P1-2611-0001).';
    try {
      const data = await this.wa.downloadMedia(m[type].id);
      await this.att.save(ctx, { orgId: tech.org_id, userId: tech.user_id, name: tech.full_name }, target[0].id, data, type === 'document' ? m.document?.filename : undefined, 'whatsapp', m.id);
      return `Lampiran tersimpan di ${target[0].code}.`;
    } catch (e: any) {
      return `Lampiran tidak bisa disimpan: ${e?.message ?? 'galat'}`;
    }
  }

  private async run(ctx: DbContext, tech: Tech, cmd: WaCommand): Promise<string> {
    switch (cmd.kind) {
      case 'help': case 'unknown': return cmd.kind === 'unknown' ? 'Perintah tidak dikenali.\n' + HELP_TEXT : HELP_TEXT;
      case 'list': return this.db.tx(ctx, async (c) => {
        const r = await c.query(`select code, title, priority, status from work_orders where technician_id = $1 and status in ('assigned','progress') order by priority, created_at limit 10`, [tech.id]);
        return r.rows.length ? 'Tugas Anda:\n' + r.rows.map((w: any) => `• ${w.code} [${w.priority}] ${w.title} — ${w.status === 'progress' ? 'dikerjakan' : 'ditugaskan'}`).join('\n') : 'Tidak ada tugas aktif.';
      });
      case 'start': case 'done': return this.db.tx(ctx, async (c) => {
        const r = await c.query('select id, status, technician_id from work_orders where code = $1', [cmd.code]);
        const w = r.rows[0];
        if (!w || w.technician_id !== tech.id) return `WO ${cmd.code} tidak ditemukan di tugas Anda.`;
        if (cmd.kind === 'start') {
          if (w.status !== 'assigned') return `WO ${cmd.code} berstatus ${w.status}, tidak bisa dimulai.`;
          await c.query(`update work_orders set status = 'progress' where id = $1`, [w.id]);
          await this.wo(c, tech, w.id, 'Pekerjaan dimulai (via WhatsApp)');
          return `WO ${cmd.code} dimulai. Selamat bekerja!`;
        }
        if (w.status !== 'assigned' && w.status !== 'progress') return `WO ${cmd.code} berstatus ${w.status}, tidak bisa diselesaikan.`;
        if (w.status === 'assigned') { await c.query(`update work_orders set status = 'progress' where id = $1`, [w.id]); await this.wo(c, tech, w.id, 'Pekerjaan dimulai (via WhatsApp)'); }
        await c.query(`update work_orders set status = 'done', actual_hours = $2, downtime_hours = $3, result_notes = $4 where id = $1`, [w.id, cmd.hours, cmd.downtime, cmd.notes || null]);
        await this.wo(c, tech, w.id, `Pekerjaan selesai (via WhatsApp): ${cmd.hours} jam${cmd.notes ? ' — ' + cmd.notes : ''}. Menunggu penutupan Supervisor`);
        return `WO ${cmd.code} ditandai selesai (${cmd.hours} jam). Menunggu penutupan oleh Supervisor.`;
      }).catch((e: any) => (e?.code === '23514' || e?.code === '42501') ? `Gagal: ${e.message}` : Promise.reject(e));
    }
  }

  private wo(c: any, t: Tech, woId: string, text: string) {
    return c.query('insert into wo_logs (org_id, wo_id, actor_user_id, actor_text, text) values ($1,$2,$3,$4,$5)', [t.org_id, woId, t.user_id, t.full_name, text]);
  }

  private async reply(ctx: DbContext, tech: Tech, text: string) {
    try { await this.wa.sendText(ctx, tech.org_id, tech.id, tech.phone_e164, text); }
    catch (e: any) { this.log.warn(`Balasan WA gagal: ${e?.message}`); }
  }
}
