const CATS: [string, string][] = [['man', 'Manusia'], ['method', 'Metode'], ['measurement', 'Pengukuran'], ['machine', 'Mesin'], ['material', 'Material'], ['environment', 'Lingkungan']];
interface Cause { id: string; category: string; cause: string; isRoot: boolean }
const clip = (s: string, n = 34) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Diagram tulang ikan 6M. Tiga kategori di atas, tiga di bawah; penyebab akar diberi tanda ●. */
export default function Fishbone({ problem, causes }: { problem: string; causes: Cause[] }) {
  const W = 880, H = 360, spineY = 180, headX = 740;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Diagram tulang ikan untuk masalah: ${problem}`}>
      <line x1="30" y1={spineY} x2={headX} y2={spineY} stroke="#64748b" strokeWidth="2" />
      <rect x={headX} y={spineY - 28} width="130" height="56" rx="6" fill="#f1f5f9" stroke="#94a3b8" />
      <foreignObject x={headX + 4} y={spineY - 26} width="122" height="52"><div className="text-[11px] leading-tight text-slate-800">{clip(problem, 60)}</div></foreignObject>
      {CATS.map(([k, label], i) => {
        const top = i < 3; const x = 120 + (i % 3) * 210; const y0 = top ? 30 : H - 30;
        const items = causes.filter((c) => c.category === k).slice(0, 4);
        return (
          <g key={k}>
            <line x1={x} y1={y0} x2={x + 70} y2={spineY} stroke="#94a3b8" strokeWidth="1.5" />
            <text x={x - 10} y={top ? 20 : H - 8} className="fill-slate-800 text-[12px] font-semibold">{label}</text>
            {items.map((c, j) => {
              const ty = top ? 48 + j * 22 : H - 50 - j * 22; const tx = x + 10 + (top ? j * 14 : j * 14);
              return <text key={c.id} x={tx} y={ty} className={`text-[11px] ${c.isRoot ? 'fill-orange-700 font-semibold' : 'fill-slate-600'}`}>{c.isRoot ? '● ' : ''}{clip(c.cause)}</text>;
            })}
          </g>
        );
      })}
    </svg>
  );
}
