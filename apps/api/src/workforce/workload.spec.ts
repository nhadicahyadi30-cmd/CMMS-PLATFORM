import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, certState, DEFAULT_SETTINGS as S, evaluate, isWorkday, skillCoverage, suggest, techCapacity, techStatus, unplannedH, woRemainingH, workingDays } from './workload.rules';

const MON = '2026-11-23';   // Senin
const near = (a: number, b: number, e = 0.06) => assert.ok(Math.abs(a - b) <= e, `${a} ≉ ${b}`);

test('hari kerja: 5/6/7 hari per minggu', () => {
  assert.equal(workingDays(MON, 7, 5).length, 5); assert.equal(workingDays(MON, 7, 6).length, 6); assert.equal(workingDays(MON, 7, 7).length, 7);
  assert.equal(isWorkday('2026-11-22', 6), false); assert.equal(isWorkday('2026-11-21', 6), true); assert.equal(isWorkday('2026-11-21', 5), false);
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
});
test('kapasitas teknisi: faktor produktif, cuti, batas lembur', () => {
  const w = workingDays(MON, 7, 6);
  const c = techCapacity({ id: 'a', dailyCapacityH: 8, absences: [] }, w, 7, S);
  assert.equal(c.days, 6); assert.equal(c.nominalH, 48); near(c.productiveH, 33.6); near(c.otProductiveH, 12.6);   // min(6x4, 18) x 0,7
  const l = techCapacity({ id: 'a', dailyCapacityH: 8, absences: [{ from: '2026-11-24', to: '2026-11-25' }] }, w, 7, S);
  assert.equal(l.days, 4); assert.equal(l.absentDays, 2); near(l.productiveH, 22.4); near(l.otProductiveH, 11.2);
  const all = techCapacity({ id: 'a', dailyCapacityH: 8, absences: [{ from: '2026-11-01', to: '2026-12-31' }] }, w, 7, S);
  assert.equal(all.productiveH, 0);
});
test('permintaan: WO berjalan dihitung separuh, tak terencana pakai riwayat atau cadangan minimum', () => {
  assert.equal(woRemainingH({ status: 'progress', estHours: 4 }), 2); assert.equal(woRemainingH({ status: 'assigned', estHours: 4 }), 4);
  assert.equal(unplannedH(60, 7, 100, 10), 14); assert.equal(unplannedH(0, 7, 100, 10), 10);
});
const caps3 = () => [1, 2, 3].map((i) => techCapacity({ id: 't' + i, dailyCapacityH: 8, absences: [] }, workingDays(MON, 7, 6), 7, S));
test('evaluasi: aman → padat → lembur → kurang', () => {
  const c = caps3(); const run = (d: number) => evaluate(d, c, 7, 6, S);
  assert.equal(run(70).status, 'aman'); assert.equal(run(90).status, 'padat'); assert.equal(run(110).status, 'lembur'); assert.equal(run(150).status, 'kurang'); assert.equal(run(0).status, 'aman');
  const e = run(110); near(e.capacityH, 100.8); near(e.overtime.neededH, 13.1, 0.1); near(e.overtime.perTechPerDay, 0.7, 0.1); near(e.overtime.perTechPerWeek, 4.4, 0.1); assert.equal(e.overtime.withinLimit, true);
  assert.ok(e.advice.some((a) => a.includes('Lembur')));
});
test('evaluasi: kebutuhan teknisi (rekomendasi, minimum, dengan lembur) dan selisih', () => {
  const e = evaluate(150, caps3(), 7, 6, S);
  assert.equal(e.headcount.perTechH, 33.6); assert.equal(e.headcount.recommended, 6); assert.equal(e.headcount.minimum, 5); assert.equal(e.headcount.withOvertime, 4); assert.equal(e.headcount.gap, 3);
  assert.equal(e.overtime.withinLimit, false); assert.ok(e.advice.some((a) => a.includes('kekurangan 3')));
  const s = evaluate(30, caps3(), 7, 6, S); assert.equal(s.status, 'aman'); assert.ok(s.headcount.gap < 0); assert.ok(s.advice.some((a) => a.includes('berlebih')));
});
test('evaluasi: tanpa kapasitas', () => {
  const e = evaluate(40, [], 7, 6, S); assert.equal(e.status, 'kosong'); assert.equal(e.utilization, null); assert.ok(e.headcount.recommended >= 2);
  const abs = [techCapacity({ id: 'x', dailyCapacityH: 8, absences: [{ from: '2026-11-01', to: '2026-12-31' }] }, workingDays(MON, 7, 6), 7, S)];
  assert.equal(evaluate(40, abs, 7, 6, S).status, 'kosong');
});
test('status teknisi dari beban terhadap kapasitas', () => {
  const c = techCapacity({ id: 'a', dailyCapacityH: 8, absences: [] }, workingDays(MON, 7, 6), 7, S);
  assert.equal(techStatus(5, c, S).status, 'rendah'); assert.equal(techStatus(20, c, S).status, 'normal'); assert.equal(techStatus(30, c, S).status, 'padat');
  const l = techStatus(40, c, S); assert.equal(l.status, 'lembur'); near(l.overtimeH, 9.1, 0.1); assert.equal(techStatus(60, c, S).status, 'berlebih');
  const off = techCapacity({ id: 'a', dailyCapacityH: 8, absences: [{ from: '2026-11-01', to: '2026-12-31' }] }, workingDays(MON, 7, 6), 7, S);
  assert.equal(techStatus(0, off, S).status, 'libur'); assert.equal(techStatus(3, off, S).status, 'berlebih');
});
test('cakupan skill: kurang, SPOF, kosong, ok, sertifikat', () => {
  const techs = [{ id: 'A', shift: 'pagi', productiveH: 30, active: true }, { id: 'B', shift: 'pagi', productiveH: 30, active: true }, { id: 'C', shift: 'malam', productiveH: 30, active: true }];
  const sk = { id: 's1', code: 'LISTRIK', name: 'Listrik', minCoverage: 2 };
  const lv = (a: number, b: number, c: number) => [{ technicianId: 'A', skillId: 's1', level: a, certifiedUntil: null }, { technicianId: 'B', skillId: 's1', level: b, certifiedUntil: null }, { technicianId: 'C', skillId: 's1', level: c, certifiedUntil: null }];
  const k = skillCoverage(sk, techs, lv(4, 2, 3), 20, '2026-11-21');
  assert.equal(k.independent, 2); assert.equal(k.experts, 1); assert.equal(k.risk, 'kurang'); assert.deepEqual(k.byShift.map((b) => [b.shift, b.have, b.ok]), [['malam', 1, false], ['pagi', 1, false]]);
  assert.equal(skillCoverage(sk, techs, lv(3, 1, 0), 0, '2026-11-21').risk, 'spof');
  assert.equal(skillCoverage(sk, techs, lv(2, 1, 0), 5, '2026-11-21').risk, 'kosong');
  assert.equal(skillCoverage({ ...sk, minCoverage: 1 }, techs, lv(3, 3, 3), 0, '2026-11-21').risk, 'ok');
  const off = skillCoverage(sk, techs.map((t) => (t.id === 'C' ? { ...t, active: false } : t)), lv(3, 3, 4), 0, '2026-11-21'); assert.equal(off.independent, 2);
  assert.equal(certState(null, '2026-11-21'), 'none'); assert.equal(certState('2026-11-20', '2026-11-21'), 'lewat'); assert.equal(certState('2026-12-31', '2026-11-21'), 'segera'); assert.equal(certState('2027-06-01', '2026-11-21'), 'ok');
  const cert = skillCoverage(sk, techs, [{ technicianId: 'A', skillId: 's1', level: 3, certifiedUntil: '2026-12-01' }, { technicianId: 'B', skillId: 's1', level: 3, certifiedUntil: '2026-01-01' }], 0, '2026-11-21');
  assert.equal(cert.certExpiring, 1); assert.equal(cert.certExpired, 1);
});
test('rekomendasi penugasan: memenuhi skill dulu, lalu beban terendah; yang cuti dikeluarkan', () => {
  const base = { plantId: 'p1', shift: 'pagi', capacityH: 30, absentToday: false };
  const r = suggest({ estH: 4, minLevel: 3, plantId: 'p1', hasSkill: true }, [
    { ...base, id: 'X', name: 'X', level: 3, loadH: 10 }, { ...base, id: 'Y', name: 'Y', level: 4, loadH: 0 }, { ...base, id: 'Z', name: 'Z', level: 2, loadH: 0 }, { ...base, id: 'W', name: 'W', level: 4, loadH: 0, absentToday: true },
  ]);
  assert.deepEqual(r.map((s) => s.id), ['Y', 'X', 'Z']); assert.equal(r[2].qualified, false); assert.ok(r[0].reasons.some((x) => x.includes('memenuhi')));
  const none = suggest({ estH: 4, minLevel: 1, plantId: 'p1', hasSkill: false }, [{ ...base, id: 'A', name: 'A', level: 0, loadH: 29 }, { ...base, id: 'B', name: 'B', level: 0, loadH: 2 }]);
  assert.equal(none[0].id, 'B');
});
