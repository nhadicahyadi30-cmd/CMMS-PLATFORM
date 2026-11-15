export type WaCommand =
  | { kind: 'start'; code: string }
  | { kind: 'done'; code: string; hours: number; downtime: number; notes: string }
  | { kind: 'list' }
  | { kind: 'help' }
  | { kind: 'unknown' };

const CODE = 'WO-[A-Z0-9]{1,10}-\\d{4}-\\d{4}';
const NUM = '(\\d{1,3}(?:[.,]\\d{1,2})?)';
const num = (s: string) => Number(s.replace(',', '.'));

/** Menerjemahkan teks WhatsApp teknisi menjadi perintah. Contoh: "SELESAI WO-P1-2611-0001 1,5 jam dt 1 ganti bearing". */
export function parseCommand(raw: string): WaCommand {
  const t = raw.trim().replace(/\s+/g, ' ').toUpperCase();
  let m = new RegExp(`^(?:MULAI|START)\\s+(${CODE})$`).exec(t);
  if (m) return { kind: 'start', code: m[1] };
  m = new RegExp(`^(?:SELESAI|DONE)\\s+(${CODE})\\s+${NUM}(?:\\s*JAM)?(?:\\s+DT\\s*${NUM})?(?:\\s+(.*))?$`).exec(t);
  if (m) {
    // catatan diambil dari teks asli (bukan huruf besar) agar tetap terbaca
    const notes = m[4] ? raw.trim().replace(/\s+/g, ' ').slice(raw.trim().replace(/\s+/g, ' ').toUpperCase().lastIndexOf(m[4])) : '';
    return { kind: 'done', code: m[1], hours: num(m[2]), downtime: m[3] ? num(m[3]) : 0, notes: notes.slice(0, 1000) };
  }
  if (/^(?:STATUS|DAFTAR|TUGAS)$/.test(t)) return { kind: 'list' };
  if (/^(?:BANTUAN|HELP|\?)$/.test(t)) return { kind: 'help' };
  return { kind: 'unknown' };
}

export const HELP_TEXT =
  'Perintah:\n• MULAI <no WO>\n• SELESAI <no WO> <jam kerja> [DT <jam downtime>] [catatan]\n• STATUS (daftar tugas Anda)\nContoh: SELESAI WO-P1-2611-0001 1,5 DT 1 ganti bearing';
