import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import type { ReportData } from './report-data';
import { delta, fmtInt, fmtNum, fmtRp, periodText, PREV_LABEL, summarize, TITLES } from './report-summary';

const INK = rgb(0.043, 0.078, 0.149), TEAL = rgb(0.071, 0.769, 0.706), BLUE = rgb(0.184, 0.42, 1), BLUE2 = rgb(0.122, 0.278, 0.784);
const G9 = rgb(0.12, 0.15, 0.2), G6 = rgb(0.36, 0.42, 0.5), G4 = rgb(0.58, 0.64, 0.7), G2 = rgb(0.88, 0.9, 0.93), G1 = rgb(0.955, 0.965, 0.98);
const GOOD = rgb(0.05, 0.55, 0.38), BAD = rgb(0.78, 0.2, 0.18), AMBER = rgb(0.8, 0.52, 0.05);
const W = 595.28, H = 841.89, M = 40, CW = W - 2 * M;
const MARK = 'M302 54.1A17 17 0 0 1 328 54.1M294.3 47.6A27 27 0 0 1 335.7 47.6';

/** Hanya karakter WinAnsi yang bisa dicetak font standar PDF. */
const safe = (s: string) => s.replace(/→/g, '->').replace(/[≥]/g, '>=').replace(/[≤]/g, '<=').replace(/[^\x20-\x7E -ÿ–—‘’“”•…]/g, '?');

class Pdf {
  doc!: PDFDocument; reg!: PDFFont; bold!: PDFFont; page!: PDFPage; y = 0; pages: PDFPage[] = [];
  static async create() { const p = new Pdf(); p.doc = await PDFDocument.create(); p.reg = await p.doc.embedFont(StandardFonts.Helvetica); p.bold = await p.doc.embedFont(StandardFonts.HelveticaBold); return p; }

  newPage() { this.page = this.doc.addPage([W, H]); this.pages.push(this.page); this.y = H - M - 12; return this.page; }
  need(h: number) { if (this.y - h < M + 24) { this.newPage(); this.y = H - M - 4; } }
  text(s: string, x: number, y: number, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; align?: 'l' | 'r' | 'c'; max?: number } = {}) {
    const f = o.bold ? this.bold : this.reg, size = o.size ?? 9; let t = safe(s);
    if (o.max && f.widthOfTextAtSize(t, size) > o.max) { while (t.length > 1 && f.widthOfTextAtSize(t + '..', size) > o.max) t = t.slice(0, -1); t += '..'; }
    const w = f.widthOfTextAtSize(t, size); const px = o.align === 'r' ? x - w : o.align === 'c' ? x - w / 2 : x;
    this.page.drawText(t, { x: px, y, size, font: f, color: o.color ?? G9 });
  }
  wrap(s: string, width: number, size: number): string[] {
    const words = safe(s).split(/\s+/); const lines: string[] = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (this.reg.widthOfTextAtSize(t, size) > width && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur); return lines;
  }
  rect(x: number, y: number, w: number, h: number, color: ReturnType<typeof rgb>, border?: ReturnType<typeof rgb>) { this.page.drawRectangle({ x, y, width: w, height: h, color, borderColor: border, borderWidth: border ? 0.6 : 0 }); }

  logo(x: number, top: number, s: number) {
    const o = { x: x - 222 * s, y: top + 26 * s, scale: s };
    this.page.drawSvgPath(MARK, { ...o, borderColor: TEAL, borderWidth: 4.5 * s, color: undefined });
    this.page.drawSvgPath('M315 73V90', { ...o, borderColor: TEAL, borderWidth: 3.5 * s });
    this.page.drawSvgPath('M307 65a8 8 0 1 0 16 0a8 8 0 1 0 -16 0Z', { ...o, color: TEAL });
    this.page.drawSvgPath('M240 130 315 88 390 130 315 170Z', { ...o, color: TEAL });
    this.page.drawSvgPath('M231 136 309 181V268L231 224Z', { ...o, color: BLUE });
    this.page.drawSvgPath('M321 181 399 136V224L321 268Z', { ...o, color: BLUE2 });
  }

  section(title: string, sub?: string) {
    this.need(60); this.y -= 8;
    this.rect(M, this.y - 1, 3, 13, TEAL);
    this.text(title, M + 10, this.y, { size: 11.5, bold: true, color: INK });
    if (sub) this.text(sub, W - M, this.y, { size: 8, color: G4, align: 'r' });
    this.y -= 18;
  }
}

export async function renderReportPdf(d: ReportData): Promise<Uint8Array> {
  const p = await Pdf.create();
  p.doc.setTitle(`${TITLES[d.frequency]} - ${d.plant}`); p.doc.setAuthor('MaintHub'); p.doc.setProducer('MaintHub'); p.doc.setCreator('MaintHub');
  p.newPage();

  // ---- Header ----
  p.rect(0, H - 96, W, 96, INK);
  p.logo(M, H - 20, 0.26);
  p.text('Maint', M + 52, H - 52, { size: 20, bold: true, color: rgb(0.96, 0.95, 0.93) });
  p.text('Hub', M + 52 + p.bold.widthOfTextAtSize('Maint', 20), H - 52, { size: 20, bold: true, color: TEAL });
  p.text('Predict. Maintain. Optimize. Connected.', M + 52, H - 66, { size: 6.5, color: G4 });
  p.text(TITLES[d.frequency].toUpperCase(), W - M, H - 40, { size: 12, bold: true, color: rgb(1, 1, 1), align: 'r' });
  p.text(periodText(d), W - M, H - 56, { size: 9.5, color: rgb(0.8, 0.85, 0.92), align: 'r' });
  p.text(`${d.org}  |  ${d.plant}`, W - M, H - 70, { size: 8.5, color: G4, align: 'r', max: 330 });
  p.y = H - 96 - 24;

  // ---- Executive summary ----
  p.section('Executive Summary');
  const lines = summarize(d);
  const boxTop = p.y + 6; let yy = p.y - 6;
  const wrapped = lines.map((l) => p.wrap(l, CW - 40, 9.5));
  const boxH = wrapped.reduce((a, w) => a + w.length * 13 + 4, 0) + 14;
  p.rect(M, boxTop - boxH, CW, boxH, G1, G2);
  for (const w of wrapped) {
    p.rect(M + 12, yy - 1, 3, 3, TEAL);
    w.forEach((ln, i) => p.text(ln, M + 22, yy - i * 13 - 2, { size: 9.5, color: G9 }));
    yy -= w.length * 13 + 4;
  }
  p.y = boxTop - boxH - 18;

  // ---- KPI cards ----
  const c = d.current, pr = d.previous, vs = PREV_LABEL[d.frequency];
  p.section('Key Indicators', `Dibanding ${vs}`);
  const cards: { label: string; value: string; unit: string; dl: ReturnType<typeof delta> }[] = [
    { label: 'AVAILABILITY', value: fmtNum(c.availabilityPct, 2), unit: '%', dl: delta(c.availabilityPct, pr.availabilityPct, true, ' pt', 2) },
    { label: 'MTTR', value: fmtNum(c.mttrH, 2), unit: 'jam', dl: delta(c.mttrH, pr.mttrH, false, ' jam', 2) },
    { label: 'MTBF', value: fmtNum(c.mtbfH, 1), unit: 'jam', dl: delta(c.mtbfH, pr.mtbfH, true, ' jam', 1) },
    { label: 'PM COMPLIANCE', value: fmtNum(c.pmCompliancePct, 0), unit: '%', dl: delta(c.pmCompliancePct, pr.pmCompliancePct, true, ' pt', 0) },
    { label: 'BREAKDOWNS', value: fmtInt(c.breakdowns), unit: 'kejadian', dl: delta(c.breakdowns, pr.breakdowns, false, '', 0) },
    { label: 'DOWNTIME', value: fmtNum(c.downtimeH, 1), unit: 'jam', dl: delta(c.downtimeH, pr.downtimeH, false, ' jam', 1) },
    { label: 'WO COMPLETED', value: fmtInt(c.woDone), unit: 'WO', dl: delta(c.woDone, pr.woDone, true, '', 0) },
    { label: 'OPEN BACKLOG', value: fmtInt(c.backlog), unit: c.backlogOverdue ? `${c.backlogOverdue} lewat SLA` : 'WO', dl: { text: 'posisi saat ini', tone: 'na' } },
  ];
  const cw = (CW - 3 * 8) / 4, ch = 62;
  p.need(ch * 2 + 16);
  cards.forEach((k, i) => {
    const x = M + (i % 4) * (cw + 8), top = p.y - Math.floor(i / 4) * (ch + 8);
    p.rect(x, top - ch, cw, ch, rgb(1, 1, 1), G2); p.rect(x, top - ch, 3, ch, i < 4 ? BLUE : TEAL);
    p.text(k.label, x + 12, top - 14, { size: 7, bold: true, color: G4 });
    p.text(k.value, x + 12, top - 36, { size: 20, bold: true, color: INK });
    p.text(k.unit, x + 14 + p.bold.widthOfTextAtSize(safe(k.value), 20), top - 36, { size: 8, color: G6 });
    const tone = k.dl.tone === 'good' ? GOOD : k.dl.tone === 'bad' ? BAD : G4;
    p.text(`${k.dl.text}${k.dl.tone === 'good' ? '  better' : k.dl.tone === 'bad' ? '  worse' : ''}`, x + 12, top - 53, { size: 7.5, color: tone, bold: k.dl.tone === 'good' || k.dl.tone === 'bad' });
  });
  p.y -= ch * 2 + 8 + 14;

  // ---- Pareto ----
  p.section('Top Downtime Assets', 'Pareto 5 aset teratas');
  if (!d.pareto.length) { p.text('Tidak ada downtime pada periode ini.', M + 10, p.y, { size: 9, color: G6 }); p.y -= 22; }
  else {
    const max = Math.max(...d.pareto.map((r) => r.downtimeH));
    for (const r of d.pareto) {
      p.need(20);
      p.text(`${r.code}`, M + 4, p.y, { size: 8.5, bold: true }); p.text(r.name, M + 66, p.y, { size: 8.5, color: G6, max: 180 });
      const bx = M + 260, bw = 170; p.rect(bx, p.y - 2, bw, 9, G1); p.rect(bx, p.y - 2, Math.max(2, (bw * r.downtimeH) / max), 9, BLUE);
      p.text(`${fmtNum(r.downtimeH)} jam`, bx + bw + 8, p.y, { size: 8.5, bold: true }); p.text(`${fmtNum(r.sharePct, 0)}%  |  ${r.breakdowns}x`, W - M, p.y, { size: 8, color: G6, align: 'r' });
      p.y -= 18;
    }
  }

  // ---- Backlog ----
  p.section('Backlog Aging', 'WO belum selesai berdasarkan umur');
  const bmax = Math.max(1, ...d.backlog.map((b) => b.n)); p.need(70);
  const bw = CW / d.backlog.length;
  d.backlog.forEach((b, i) => {
    const x = M + i * bw + 6, h = Math.max(2, (b.n / bmax) * 38);
    p.rect(x, p.y - 44, bw - 12, h, i >= 3 ? AMBER : BLUE);
    p.text(String(b.n), x + (bw - 12) / 2, p.y - 44 + h + 4, { size: 8.5, bold: true, align: 'c' });
    p.text(b.bucket, x + (bw - 12) / 2, p.y - 56, { size: 7.5, color: G6, align: 'c' });
    if (b.overdue) p.text(`${b.overdue} lewat SLA`, x + (bw - 12) / 2, p.y - 66, { size: 6.5, color: BAD, align: 'c' });
  });
  p.y -= 84;

  // ---- Cost ----
  p.need(60 + Math.max(1, d.costAssets.length) * 14);
  p.section('Maintenance Cost', `Total ${fmtRp(c.partsCost + c.laborCost)}`);
  const table = (cols: { h: string; x: number; a?: 'l' | 'r'; max?: number }[], rows: string[][], boldFirst = true) => {
    p.need(22); p.rect(M, p.y - 4, CW, 15, G1);
    cols.forEach((k) => p.text(k.h, k.a === 'r' ? M + k.x : M + k.x + 4, p.y, { size: 7.5, bold: true, color: G6, align: k.a === 'r' ? 'r' : 'l' }));
    p.y -= 17;
    rows.forEach((r, ri) => { p.need(16); if (ri % 2) p.rect(M, p.y - 4, CW, 14, rgb(0.985, 0.988, 0.994));
      cols.forEach((k, i) => p.text(r[i] ?? '', k.a === 'r' ? M + k.x : M + k.x + 4, p.y, { size: 8.5, bold: boldFirst && i === 0, align: k.a === 'r' ? 'r' : 'l', max: k.max }));
      p.y -= 14; });
    p.y -= 6;
  };
  if (!d.costAssets.length) { p.text('Tidak ada biaya tercatat pada periode ini.', M + 10, p.y, { size: 9, color: G6 }); p.y -= 22; }
  else table([{ h: 'ASSET', x: 0 }, { h: 'NAME', x: 70, max: 150 }, { h: 'WO', x: 245, a: 'r' }, { h: 'SPARE PARTS', x: 345, a: 'r' }, { h: 'LABOR', x: 435, a: 'r' }, { h: 'TOTAL', x: CW, a: 'r' }],
    d.costAssets.map((r) => [r.code, r.name, String(r.woCount), fmtRp(r.partsCost), fmtRp(r.laborCost), fmtRp(r.totalCost)]));

  // ---- Technicians ----
  p.need(60 + Math.max(1, d.technicians.length) * 14);
  p.section('Technician Performance', 'WO selesai pada periode');
  if (!d.technicians.length) { p.text('Belum ada WO selesai pada periode ini.', M + 10, p.y, { size: 9, color: G6 }); p.y -= 22; }
  else table([{ h: 'CODE', x: 0 }, { h: 'TECHNICIAN', x: 70, max: 190 }, { h: 'WO DONE', x: 310, a: 'r' }, { h: 'HOURS', x: 370, a: 'r' }, { h: 'AVG H/WO', x: 440, a: 'r' }, { h: 'SLA MET', x: CW, a: 'r' }],
    d.technicians.map((t) => [t.code, t.name, String(t.done), fmtNum(t.hours, 1), fmtNum(t.avgH, 1), t.slaPct === null ? '-' : `${fmtNum(t.slaPct, 0)}%`]));

  // ---- Low stock ----
  if (d.lowStock.length) {
    p.need(60 + d.lowStock.length * 14);
    p.section('Spare Parts Below Minimum', 'Perlu dipesan ulang');
    table([{ h: 'CODE', x: 0 }, { h: 'PART', x: 80, max: 200 }, { h: 'ON HAND', x: 340, a: 'r' }, { h: 'MINIMUM', x: 410, a: 'r' }, { h: 'STATUS', x: CW, a: 'r' }],
      d.lowStock.map((s) => [s.code, s.name, `${fmtNum(s.onHand, 0)} ${s.unit}`, `${fmtNum(s.minStock, 0)} ${s.unit}`, s.critical ? 'CRITICAL' : 'Low']));
  }

  // ---- Trend (bulanan/tahunan) ----
  if (d.trend && d.trend.length) {
    p.section('12-Month Trend', 'Downtime per bulan (jam) dan jumlah breakdown'); p.need(110);
    const tmax = Math.max(1, ...d.trend.map((t) => t.downtimeH)); const tw = CW / d.trend.length; const base = p.y - 84;
    p.page.drawLine({ start: { x: M, y: base }, end: { x: W - M, y: base }, thickness: 0.6, color: G2 });
    d.trend.forEach((t, i) => {
      const h = Math.max(1.5, (t.downtimeH / tmax) * 62), x = M + i * tw + 5;
      p.rect(x, base, tw - 10, h, i === d.trend!.length - 1 ? TEAL : BLUE);
      p.text(fmtNum(t.downtimeH, 0), x + (tw - 10) / 2, base + h + 3, { size: 7, bold: true, align: 'c' });
      p.text(t.month.slice(2).replace('-', '/'), x + (tw - 10) / 2, base - 10, { size: 7, color: G6, align: 'c' });
      p.text(`${t.breakdowns}x`, x + (tw - 10) / 2, base - 20, { size: 6.5, color: G4, align: 'c' });
    });
    p.y -= 110;
  }

  // ---- Footer di setiap halaman ----
  const n = p.pages.length;
  p.pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: M, y: 30 }, end: { x: W - M, y: 30 }, thickness: 0.5, color: G2 });
    const f = p.reg;
    pg.drawText(safe(`MaintHub  |  Predict. Maintain. Optimize. Connected.`), { x: M, y: 18, size: 7, font: f, color: G4 });
    const r = safe(`Dibuat ${d.generatedAt} WIB  |  Halaman ${i + 1} / ${n}`);
    pg.drawText(r, { x: W - M - f.widthOfTextAtSize(r, 7), y: 18, size: 7, font: f, color: G4 });
  });
  return p.doc.save();
}
