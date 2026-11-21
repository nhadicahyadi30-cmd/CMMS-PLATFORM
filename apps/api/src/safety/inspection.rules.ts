import { z } from 'zod';

export const ItemDto = z.object({
  text: z.string().trim().min(2).max(300), kind: z.enum(['check', 'number', 'text']).default('check'),
  unit: z.string().trim().max(20).nullish(), minVal: z.number().nullish(), maxVal: z.number().nullish(),
  required: z.boolean().default(true), critical: z.boolean().default(false),
}).refine((i) => i.kind === 'number' || (i.minVal == null && i.maxVal == null), { message: 'Batas hanya untuk butir angka', path: ['minVal'] })
  .refine((i) => i.minVal == null || i.maxVal == null || i.minVal <= i.maxVal, { message: 'Batas bawah tidak boleh melebihi batas atas', path: ['minVal'] });

export const TemplateDto = z.object({
  plantId: z.string().uuid(), code: z.string().trim().regex(/^[A-Za-z0-9._-]{2,30}$/, 'Kode 2–30 karakter huruf, angka, . _ -'),
  name: z.string().trim().min(3).max(200), description: z.string().trim().max(1000).default(''),
  assetId: z.string().uuid().nullish(), audience: z.enum(['any', 'technician', 'production']).default('any'),
  frequencyDays: z.number().int().min(1).max(366).nullish(), active: z.boolean().default(true),
  items: z.array(ItemDto).min(1).max(100),
});

export const ResultDto = z.object({
  itemId: z.string().uuid(), ok: z.boolean().optional(), value: z.number().optional(), text: z.string().max(1000).optional(), note: z.string().max(500).optional(),
});
export const RecordDto = z.object({
  templateId: z.string().uuid(), assetId: z.string().uuid().nullish(), performedAt: z.string().datetime({ offset: true }).optional(),
  notes: z.string().trim().max(1000).default(''), results: z.array(ResultDto).max(200), clientUid: z.string().uuid().nullish(),
});

/** Template yang boleh dilihat/dikerjakan peran tertentu. */
export function audiencesFor(role: string): string[] {
  if (role === 'production') return ['any', 'production'];
  if (role === 'technician') return ['any', 'technician'];
  return ['any', 'technician', 'production'];
}

/** Butir tidak normal: cermin aturan database (dipakai UI untuk menandai sebelum kirim). */
export function isAbnormal(item: { kind: string; minVal?: number | null; maxVal?: number | null }, r: { ok?: boolean; value?: number }): boolean {
  if (item.kind === 'check') return r.ok === false;
  if (item.kind === 'number') return r.value != null && ((item.minVal != null && r.value < item.minVal) || (item.maxVal != null && r.value > item.maxVal));
  return false;
}
