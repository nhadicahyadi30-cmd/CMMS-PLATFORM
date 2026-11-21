import { z } from 'zod';

export const PERMIT_STATUS = ['requested', 'approved', 'handed_over', 'active', 'completed', 'closed', 'rejected', 'cancelled'] as const;
export type PermitStatus = (typeof PERMIT_STATUS)[number];
export const WORK_TYPES = ['general', 'electrical', 'hot_work', 'confined_space', 'height', 'excavation', 'chemical'] as const;
export const ENERGY_TYPES = ['electrical', 'mechanical', 'hydraulic', 'pneumatic', 'thermal', 'chemical', 'gravity', 'other'] as const;
export type Role = 'admin' | 'supervisor' | 'planner' | 'technician' | 'production';

const IsoDate = z.string().datetime({ offset: true });
const PointDto = z.object({
  description: z.string().trim().min(2).max(300), energyType: z.enum(ENERGY_TYPES).default('electrical'), method: z.string().trim().max(300).default(''),
});

export const PermitDto = z.object({
  plantId: z.string().uuid(), assetId: z.string().uuid(), woId: z.string().uuid().nullish(),
  workType: z.enum(WORK_TYPES).default('general'),
  title: z.string().trim().min(3).max(200),
  hazards: z.string().trim().max(2000).default(''), precautions: z.string().trim().max(2000).default(''),
  requiresLoto: z.boolean().default(true), team: z.string().trim().max(300).default(''),
  validFrom: IsoDate, validUntil: IsoDate,
  lotoPointIds: z.array(z.string().uuid()).max(50).default([]),
  extraPoints: z.array(PointDto).max(50).default([]),
}).refine((d) => Date.parse(d.validUntil) > Date.parse(d.validFrom), { message: 'Waktu selesai harus setelah waktu mulai', path: ['validUntil'] })
  .refine((d) => Date.parse(d.validUntil) - Date.parse(d.validFrom) <= 24 * 3600 * 1000, { message: 'Masa berlaku izin maksimal 24 jam', path: ['validUntil'] });

export const PermitPatch = z.object({
  workType: z.enum(WORK_TYPES), title: z.string().trim().min(3).max(200), hazards: z.string().trim().max(2000), precautions: z.string().trim().max(2000),
  requiresLoto: z.boolean(), team: z.string().trim().max(300), validFrom: IsoDate, validUntil: IsoDate,
}).partial();
export const PointAdd = PointDto;
export const LockAdd = z.object({ lockNo: z.string().trim().min(1).max(40) });
export const LockRemove = z.object({ reason: z.string().trim().max(300).default('') });
export const Note = z.object({ note: z.string().trim().max(500).default('') });
export const Reason = z.object({ reason: z.string().trim().min(3).max(500) });
export const LotoDto = z.object({
  plantId: z.string().uuid(), assetId: z.string().uuid(), seq: z.number().int().min(1).max(999),
  description: z.string().trim().min(2).max(300), energyType: z.enum(ENERGY_TYPES).default('electrical'), method: z.string().trim().max(300).default(''), active: z.boolean().default(true),
});

/** Aksi yang boleh dilakukan pengguna pada izin (cermin aturan trigger database, dipakai UI untuk menampilkan tombol). */
export function permitActions(status: PermitStatus, role: Role, userId: string, requesterId: string): string[] {
  const out: string[] = [];
  const sup = role === 'supervisor' || role === 'admin';
  const prod = role === 'production' || role === 'admin';
  const worker = role !== 'production';
  const owner = userId === requesterId;
  switch (status) {
    case 'requested':
      if (sup) out.push('approve', 'reject');
      if (owner || sup) out.push('edit', 'cancel');
      break;
    case 'approved':
      if (prod) out.push('handover');
      if (owner || sup) out.push('edit', 'cancel');
      break;
    case 'handed_over':
      out.push('lock');
      if (worker) out.push('verify', 'activate');
      if (owner || sup) out.push('cancel');
      break;
    case 'active':
      out.push('unlock');
      if (worker) out.push('complete');
      break;
    case 'completed':
      if (prod) out.push('close');
      break;
  }
  return out;
}

/** Izin aktif yang melewati masa berlaku. */
export function permitExpired(status: PermitStatus, validUntil: string | Date, now = new Date()): boolean {
  return ['active', 'handed_over'].includes(status) && new Date(validUntil).getTime() < now.getTime();
}
