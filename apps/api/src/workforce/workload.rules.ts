/**
 * Aturan hitung beban kerja teknisi, kebutuhan tenaga, lembur, dan skill.
 * Murni (tanpa DB) supaya bisa diuji. Satuan jam kecuali disebut lain.
 *
 * Asumsi (semua bisa diatur di Pengaturan): hanya `productiveFactor` dari jam kerja yang dipakai mengerjakan WO
 * (sisanya perjalanan, tunggu izin kerja, briefing, istirahat); pekerjaan tak terencana diperkirakan dari rata-rata
 * 30 hari terakhir dan tidak kurang dari `reservePct` kapasitas.
 */
import { z } from 'zod';

export interface Settings { productiveFactor: number; reservePct: number; workdaysPerWeek: number; otMaxDayH: number; otMaxWeekH: number; targetUtil: number }
// Batas lembur bawaan (4 jam/hari, 18 jam/minggu) mengikuti ketentuan umum ketenagakerjaan di Indonesia; sesuaikan dengan kebijakan perusahaan/PKB dan verifikasi ke HR/hukum.
export const DEFAULT_SETTINGS: Settings = { productiveFactor: 0.7, reservePct: 10, workdaysPerWeek: 6, otMaxDayH: 4, otMaxWeekH: 18, targetUtil: 0.85 };

export const SettingsDto = z.object({
  productiveFactor: z.number().min(0.3).max(1), reservePct: z.number().int().min(0).max(60), workdaysPerWeek: z.number().int().min(5).max(7),
  otMaxDayH: z.number().min(0).max(12), otMaxWeekH: z.number().min(0).max(60), targetUtil: z.number().min(0.5).max(1),
}).partial();

export const LEVELS = ['Belum', 'Dasar', 'Terbatas', 'Mandiri', 'Ahli'] as const;   // indeks = level 0..4
export const INDEP = 3;                                                              // level "mandiri" = dihitung sebagai tercakup

// ---------- tanggal (string 'YYYY-MM-DD', UTC) ----------
const DAY = 86_400_000;
export function addDays(d: string, n: number): string { return new Date(Date.parse(d + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10); }
export function isWorkday(d: string, perWeek: number): boolean {
  const w = new Date(d + 'T00:00:00Z').getUTCDay();   // 0 = Minggu
  return perWeek >= 7 ? true : perWeek === 6 ? w !== 0 : w >= 1 && w <= 5;
}
/** Hari kerja dalam jendela [from, from + days). */
export function workingDays(from: string, days: number, perWeek: number): string[] {
  const out: string[] = []; for (let i = 0; i < days; i++) { const d = addDays(from, i); if (isWorkday(d, perWeek)) out.push(d); } return out;
}

// ---------- kapasitas ----------
export interface Absence { from: string; to: string }
export interface TechIn { id: string; dailyCapacityH: number; absences: Absence[] }
export interface Capacity { days: number; absentDays: number; nominalH: number; productiveH: number; otProductiveH: number }

export function techCapacity(t: TechIn, work: string[], windowDays: number, s: Settings): Capacity {
  const absent = work.filter((d) => t.absences.some((a) => d >= a.from && d <= a.to)).length;
  const days = work.length - absent;
  const nominalH = days * t.dailyCapacityH;
  const otH = Math.min(days * s.otMaxDayH, (windowDays / 7) * s.otMaxWeekH);        // jam lembur maksimum pada jendela
  return { days, absentDays: absent, nominalH, productiveH: nominalH * s.productiveFactor, otProductiveH: Math.max(0, otH) * s.productiveFactor };
}

// ---------- permintaan (demand) ----------
export interface WoLite { status: string; estHours: number }
/** Sisa jam WO terbuka: WO yang sedang dikerjakan dihitung separuh estimasi (tidak ada pencatatan jam berjalan). */
export function woRemainingH(w: WoLite): number { return w.status === 'progress' ? w.estHours * 0.5 : w.estHours; }

export function unplannedH(history30dH: number, windowDays: number, capacityH: number, reservePct: number): number {
  return Math.max((history30dH / 30) * windowDays, capacityH * (reservePct / 100));
}

export interface Demand { assignedH: number; backlogH: number; pmH: number; unplannedH: number }
export const totalDemand = (d: Demand): number => d.assignedH + d.backlogH + d.pmH + d.unplannedH;

// ---------- evaluasi ----------
export type Status = 'aman' | 'padat' | 'lembur' | 'kurang' | 'kosong';
export interface Evaluation {
  technicians: number; capacityH: number; overtimeCapacityH: number; demandH: number; utilization: number | null; status: Status;
  overtime: { neededH: number; perTechPerDay: number; perTechPerWeek: number; withinLimit: boolean };
  headcount: { current: number; recommended: number; minimum: number; withOvertime: number; gap: number; perTechH: number };
  advice: string[];
}
const r1 = (n: number): number => Math.round(n * 10) / 10;
const r2 = (n: number): number => Math.round(n * 100) / 100;
const ceil = (n: number): number => Math.ceil(n - 1e-9);

/** Evaluasi satu kelompok (plant/shift/semua) dari permintaan total terhadap kapasitas teknisi. `stdDailyH` = kapasitas harian standar bila belum ada teknisi. */
export function evaluate(demandH: number, caps: Capacity[], windowDays: number, workDaysInWindow: number, s: Settings, stdDailyH = 8): Evaluation {
  const present = caps.filter((c) => c.days > 0);
  const n = caps.length, capH = caps.reduce((a, c) => a + c.productiveH, 0), otCap = caps.reduce((a, c) => a + c.otProductiveH, 0);
  const stdPerTech = workDaysInWindow * (n ? caps.reduce((a, c) => a + (c.days ? c.nominalH / c.days : 0), 0) / Math.max(1, present.length) : stdDailyH) * s.productiveFactor;
  const utilization = capH > 0 ? demandH / capH : null;
  let status: Status;
  if (demandH <= 0) status = 'aman';
  else if (capH <= 0) status = 'kosong';
  else if (demandH <= capH * s.targetUtil) status = 'aman';
  else if (demandH <= capH) status = 'padat';
  else if (demandH <= capH + otCap) status = 'lembur';
  else status = 'kurang';
  const needOt = Math.max(0, demandH - capH);                // jam produktif yang harus ditutup lembur
  const clockOt = needOt / s.productiveFactor;               // jam kerja (jam dinding) lembur
  const availDays = caps.reduce((a, c) => a + c.days, 0);
  const perDay = availDays ? clockOt / availDays : 0, perWeek = n ? clockOt / n / (windowDays / 7) : 0;
  const within = needOt <= otCap + 1e-9;
  const recommended = stdPerTech > 0 ? ceil(demandH / (stdPerTech * s.targetUtil)) : 0;
  const minimum = stdPerTech > 0 ? ceil(demandH / stdPerTech) : 0;
  const stdOt = Math.min(workDaysInWindow * s.otMaxDayH, (windowDays / 7) * s.otMaxWeekH) * s.productiveFactor;
  const withOt = stdPerTech + stdOt > 0 ? ceil(demandH / (stdPerTech + stdOt)) : 0;
  const advice: string[] = [];
  if (status === 'kosong') advice.push('Ada pekerjaan tetapi tidak ada kapasitas teknisi (semua cuti atau belum ada teknisi).');
  else if (status === 'aman') advice.push(demandH <= 0 ? 'Belum ada beban pekerjaan pada periode ini.' : `Beban ${Math.round((utilization ?? 0) * 100)}% dari kapasitas, masih dalam target ${Math.round(s.targetUtil * 100)}%.`);
  else if (status === 'padat') advice.push(`Beban ${Math.round((utilization ?? 0) * 100)}%: di atas target ${Math.round(s.targetUtil * 100)}%, belum perlu lembur tetapi ruang cadangan tipis.`);
  else if (status === 'lembur') advice.push(`Beban ${Math.round((utilization ?? 0) * 100)}% melampaui kapasitas. Lembur sekitar ${r1(perDay)} jam/orang/hari (${r1(perWeek)} jam/minggu) masih dalam batas ${s.otMaxDayH} jam/hari dan ${s.otMaxWeekH} jam/minggu.`);
  else advice.push(`Beban ${Math.round((utilization ?? 0) * 100)}% melebihi kapasitas termasuk lembur maksimum. Perlu tambahan tenaga (teknisi atau kontraktor) atau tunda pekerjaan non-kritis.`);
  if (status === 'padat' || status === 'lembur' || status === 'kurang') { const g = recommended - n; if (g > 0) advice.push(`Untuk beban ini tanpa lembur dibutuhkan ± ${recommended} teknisi (sekarang ${n}): kekurangan ${g}.`); }
  if (status === 'aman' && recommended < n && demandH > 0) advice.push(`Kapasitas berlebih: cukup ± ${recommended} teknisi untuk beban ini; ${n - recommended} bisa dibantukan ke area lain.`);
  return { technicians: n, capacityH: r1(capH), overtimeCapacityH: r1(otCap), demandH: r1(demandH), utilization: utilization == null ? null : r2(utilization), status,
    overtime: { neededH: r1(clockOt), perTechPerDay: r1(perDay), perTechPerWeek: r1(perWeek), withinLimit: within },
    headcount: { current: n, recommended, minimum, withOvertime: withOt, gap: recommended - n, perTechH: r1(stdPerTech) }, advice };
}

/** Status satu teknisi dari beban WO yang sudah ditugaskan. */
export type TechStatus = 'libur' | 'rendah' | 'normal' | 'padat' | 'lembur' | 'berlebih';
export function techStatus(loadH: number, c: Capacity, s: Settings): { status: TechStatus; utilization: number | null; overtimeH: number } {
  if (c.productiveH <= 0) return { status: loadH > 0 ? 'berlebih' : 'libur', utilization: null, overtimeH: 0 };
  const u = loadH / c.productiveH, ot = Math.max(0, loadH - c.productiveH);
  const status: TechStatus = u < 0.5 ? 'rendah' : u <= s.targetUtil ? 'normal' : u <= 1 ? 'padat' : ot <= c.otProductiveH + 1e-9 ? 'lembur' : 'berlebih';
  return { status, utilization: r2(u), overtimeH: r1(ot / s.productiveFactor) };
}

// ---------- skill ----------
export interface TechSkill { technicianId: string; skillId: string; level: number; certifiedUntil: string | null }
export interface TechInfo { id: string; shift: string; productiveH: number; active: boolean }
export interface SkillInfo { id: string; code: string; name: string; minCoverage: number }
export type Risk = 'ok' | 'kurang' | 'spof' | 'kosong';

export function certState(until: string | null, today: string): 'none' | 'ok' | 'segera' | 'lewat' {
  if (!until) return 'none'; if (until < today) return 'lewat'; return until <= addDays(today, 60) ? 'segera' : 'ok';
}

/** Cakupan skill: jumlah teknisi mandiri (≥3) total & per shift, risiko, beban skill terhadap kapasitas teknisi mandiri. */
export function skillCoverage(skill: SkillInfo, techs: TechInfo[], levels: TechSkill[], demandH: number, today: string) {
  const lv = new Map(levels.filter((l) => l.skillId === skill.id).map((l) => [l.technicianId, l]));
  const active = techs.filter((t) => t.active);
  const indep = active.filter((t) => (lv.get(t.id)?.level ?? 0) >= INDEP);
  const shifts = [...new Set(active.map((t) => t.shift))].sort();
  const byShift = shifts.map((sh) => { const have = indep.filter((t) => t.shift === sh).length; return { shift: sh, have, need: skill.minCoverage, ok: have >= skill.minCoverage }; });
  const level4 = active.filter((t) => (lv.get(t.id)?.level ?? 0) >= 4).length;
  const certs = active.map((t) => ({ id: t.id, st: certState(lv.get(t.id)?.certifiedUntil ?? null, today) })).filter((c) => c.st === 'segera' || c.st === 'lewat');
  const capH = indep.reduce((a, t) => a + t.productiveH, 0);
  let risk: Risk = 'ok';
  if (indep.length === 0 && (demandH > 0 || skill.minCoverage > 0)) risk = 'kosong';
  else if (indep.length === 1 && skill.minCoverage >= 2) risk = 'spof';
  else if (indep.length < skill.minCoverage || byShift.some((b) => !b.ok)) risk = 'kurang';
  return { independent: indep.length, experts: level4, byShift, risk, certExpiring: certs.filter((c) => c.st === 'segera').length, certExpired: certs.filter((c) => c.st === 'lewat').length,
    demandH: r1(demandH), capacityH: r1(capH), utilization: capH > 0 ? r2(demandH / capH) : null };
}

// ---------- rekomendasi penugasan ----------
export interface Candidate { id: string; name: string; plantId: string; shift: string; level: number; loadH: number; capacityH: number; absentToday: boolean }
export interface Suggestion { id: string; name: string; score: number; qualified: boolean; level: number; utilizationAfter: number | null; reasons: string[] }

export function suggest(wo: { estH: number; minLevel: number; plantId: string; hasSkill: boolean }, cands: Candidate[], limit = 5): Suggestion[] {
  const out: Suggestion[] = cands.filter((c) => !c.absentToday).map((c) => {
    const qualified = !wo.hasSkill || c.level >= wo.minLevel;
    const after = c.capacityH > 0 ? (c.loadH + wo.estH) / c.capacityH : null;
    const free = Math.max(0, c.capacityH - c.loadH);
    let score = (qualified ? 1000 : 0) + (after == null ? -200 : (1 - Math.min(after, 1.5)) * 100) + (c.plantId === wo.plantId ? 10 : 0) - (wo.hasSkill && qualified ? Math.max(0, c.level - wo.minLevel) * 4 : 0);
    const reasons: string[] = [];
    if (wo.hasSkill) reasons.push(qualified ? `skill level ${c.level} (${LEVELS[c.level]}) memenuhi minimum ${wo.minLevel}` : `skill level ${c.level}, di bawah minimum ${wo.minLevel}`);
    reasons.push(after == null ? 'tidak ada kapasitas pada periode ini' : `beban jadi ${Math.round(after * 100)}% (sisa kapasitas ${r1(free)} jam)`);
    if (c.plantId === wo.plantId) reasons.push('plant sama');
    return { id: c.id, name: c.name, score: Math.round(score * 10) / 10, qualified, level: c.level, utilizationAfter: after == null ? null : r2(after), reasons };
  });
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
