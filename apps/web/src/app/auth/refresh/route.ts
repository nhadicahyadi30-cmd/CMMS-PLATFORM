import { NextRequest, NextResponse } from 'next/server';
import { API, COOKIE, withCookie } from '@/lib/server-auth';
export async function POST(req: NextRequest) {
  const rt = req.cookies.get(COOKIE)?.value;
  if (!rt) return NextResponse.json({ message: 'Belum login' }, { status: 401 });
  const r = await fetch(`${API}/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return withCookie(NextResponse.json({ message: 'Sesi berakhir' }, { status: 401 }), null);
  const { refreshToken, ...rest } = data;
  return withCookie(NextResponse.json(rest), refreshToken);
}
