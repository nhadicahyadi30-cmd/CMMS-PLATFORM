import { z } from 'zod';

export const LeadDto = z.object({
  name: z.string().trim().min(1).max(200),
  company: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(60).optional().default(''),
  email: z.string().trim().max(200).optional().default('').refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'invalid email'),
  size: z.string().trim().max(200).optional().default(''),
  message: z.string().trim().max(4000).optional().default(''),
  website: z.string().max(200).optional().default(''), // honeypot: manusia tidak mengisi
});

/** Pembatas laju sederhana per kunci (IP): maks `max` permintaan per `windowMs`. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private windowMs: number) {}
  allow(key: string, now = Date.now()): boolean {
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.max) { this.hits.set(key, arr); return false; }
    arr.push(now); this.hits.set(key, arr);
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (!v.some((t) => now - t < this.windowMs)) this.hits.delete(k);
    return true;
  }
}

/** Hindari injeksi header/baris baru pada email notifikasi. */
export const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();
