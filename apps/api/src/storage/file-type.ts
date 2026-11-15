export interface Sniffed { mime: string; ext: string; kind: 'photo' | 'document' }

/** Deteksi tipe berkas dari isinya (bukan dari header/ekstensi kiriman klien). Hanya JPEG, PNG, WebP, PDF. */
export function sniff(b: Uint8Array): Sniffed | null {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (b.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return { mime: 'image/jpeg', ext: 'jpg', kind: 'photo' };
  if (b.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { mime: 'image/png', ext: 'png', kind: 'photo' };
  if (b.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return { mime: 'image/webp', ext: 'webp', kind: 'photo' };
  if (b.length >= 5 && at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return { mime: 'application/pdf', ext: 'pdf', kind: 'document' };
  return null;
}

/** Nama berkas aman untuk disimpan/ditampilkan: tanpa jalur, karakter kontrol, dan terlalu panjang. */
export function safeName(n: string | undefined, fallbackExt: string): string {
  const base = (n ?? '').split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f"<>|?*:]/g, '').trim().slice(0, 120);
  return base || `lampiran.${fallbackExt}`;
}
