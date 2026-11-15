import { Injectable, Logger } from '@nestjs/common';
import { DbService, DbContext } from '../db/db.service';
import { config } from '../config';
import { AuthUser } from '../auth/auth.types';

@Injectable()
export class WhatsappService {
  private log = new Logger('WhatsApp');
  constructor(private db: DbService) {}

  private ctx(u: AuthUser): DbContext { return { orgId: u.org, plantIds: u.plants, allPlants: u.all }; }

  /** Kirim template "wo_assigned" ke teknisi. Hanya jika opt-in, nomor ada, dan template sudah disetujui Meta. */
  async notifyAssigned(u: AuthUser, woId: string): Promise<void> {
    if (!config.wa.token || !config.wa.phoneId) return; // WA belum dikonfigurasi
    const info = await this.db.tx(this.ctx(u), async (c) => {
      const r = await c.query(
        `select w.code, w.title, w.priority, a.name as asset, t.id as tech_id, t.phone_e164, t.wa_opt_in, t.full_name
           from work_orders w join assets a on a.id = w.asset_id join technicians t on t.id = w.technician_id where w.id = $1`, [woId]);
      const tpl = await c.query(`select name, language from wa_templates where event = 'wo_assigned' and approved limit 1`);
      return { wo: r.rows[0], tpl: tpl.rows[0] };
    });
    if (!info.wo || !info.tpl || !info.wo.wa_opt_in || !info.wo.phone_e164) return;
    const { wo, tpl } = info;
    const res = await fetch(`https://graph.facebook.com/v21.0/${config.wa.phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.wa.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to: String(wo.phone_e164).replace('+', ''), type: 'template',
        template: { name: tpl.name, language: { code: tpl.language }, components: [{ type: 'body', parameters: [
          { type: 'text', text: wo.code }, { type: 'text', text: wo.title }, { type: 'text', text: wo.asset }, { type: 'text', text: wo.priority }] }] },
      }),
    });
    const body: any = await res.json().catch(() => ({}));
    const waId: string | null = body?.messages?.[0]?.id ?? null;
    if (!res.ok) this.log.warn(`Gagal kirim WA untuk ${wo.code}: ${JSON.stringify(body?.error ?? {})}`);
    await this.db.tx(this.ctx(u), (c) => c.query(
      `insert into wa_messages (org_id, direction, technician_id, wo_id, wa_message_id, to_e164, msg_type, template_name, status, error_code)
       values ($1,'out',$2,$3,$4,$5,'template',$6,$7,$8)`,
      [u.org, wo.tech_id, woId, waId, wo.phone_e164, tpl.name, res.ok ? 'sent' : 'failed', res.ok ? null : String(body?.error?.code ?? res.status)]));
  }

  /** Balasan teks bebas (hanya sah di jendela 24 jam setelah pesan teknisi). */
  async sendText(ctx: DbContext, orgId: string, techId: string, toE164: string, text: string): Promise<void> {
    if (!config.wa.token || !config.wa.phoneId) return;
    const res = await fetch(`https://graph.facebook.com/v21.0/${config.wa.phoneId}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${config.wa.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: toE164.replace('+', ''), type: 'text', text: { body: text.slice(0, 1500) } }),
    });
    const body: any = await res.json().catch(() => ({}));
    await this.db.tx(ctx, (c) => c.query(
      `insert into wa_messages (org_id, direction, technician_id, wa_message_id, to_e164, msg_type, body, status, error_code)
       values ($1,'out',$2,$3,$4,'text',$5,$6,$7)`,
      [orgId, techId, body?.messages?.[0]?.id ?? null, toE164, text.slice(0, 2000), res.ok ? 'sent' : 'failed', res.ok ? null : String(body?.error?.code ?? res.status)]));
  }

  /** Unduh media kiriman teknisi (2 langkah: ambil URL dari media id, lalu unduh dengan token). Dibatasi 10 MB. */
  async downloadMedia(mediaId: string): Promise<Uint8Array> {
    const meta: any = await (await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(mediaId)}`, { headers: { Authorization: `Bearer ${config.wa.token}` } })).json();
    if (!meta?.url || !/^https:\/\//.test(meta.url)) throw new Error('URL media tidak valid');
    if (meta.file_size && Number(meta.file_size) > config.maxUploadBytes) throw new Error('Media melebihi 10 MB');
    const r = await fetch(meta.url, { headers: { Authorization: `Bearer ${config.wa.token}` } });
    if (!r.ok) throw new Error(`Unduh media gagal (${r.status})`);
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length > config.maxUploadBytes) throw new Error('Media melebihi 10 MB');
    return buf;
  }
}
