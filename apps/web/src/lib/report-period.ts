export type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly';
export const FREQS: Freq[] = ['daily', 'weekly', 'monthly', 'yearly'];

const DAY = 86400000;
const parse = (s: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (!m) throw new Error('Tanggal harus YYYY-MM-DD'); const t = Date.UTC(+m[1], +m[2] - 1, +m[3]); if (new Date(t).toISOString().slice(0, 10) !== s) throw new Error('Tanggal tidak valid'); return t; };
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Periode laporan yang memuat tanggal `ref`: harian = hari itu; mingguan = Senin–Minggu; bulanan = bulan penuh; tahunan = tahun penuh. */
export function periodFor(freq: Freq, ref: string): { from: string; to: string } {
  const t = parse(ref); const d = new Date(t);
  if (freq === 'daily') return { from: ref, to: ref };
  if (freq === 'weekly') { const dow = (d.getUTCDay() + 6) % 7; return { from: iso(t - dow * DAY), to: iso(t - dow * DAY + 6 * DAY) }; }
  if (freq === 'monthly') return { from: iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)), to: iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)) };
  if (freq === 'yearly') return { from: `${d.getUTCFullYear()}-01-01`, to: `${d.getUTCFullYear()}-12-31` };
  throw new Error('Frekuensi tidak dikenal');
}

/** Periode pembanding: rentang sama panjang tepat sebelum periode ini (bulan/tahun menyesuaikan kalender). */
export function previousPeriod(freq: Freq, from: string, to: string): { from: string; to: string } {
  const f = parse(from), d = new Date(f);
  if (freq === 'monthly') return periodFor('monthly', iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)));
  if (freq === 'yearly') return periodFor('yearly', `${d.getUTCFullYear() - 1}-01-01`);
  const n = (parse(to) - f) / DAY + 1;
  return { from: iso(f - n * DAY), to: iso(f - DAY) };
}

export const daysIn = (from: string, to: string) => (parse(to) - parse(from)) / DAY + 1;
