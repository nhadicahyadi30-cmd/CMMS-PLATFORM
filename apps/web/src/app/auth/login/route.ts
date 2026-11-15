import { NextRequest, NextResponse } from 'next/server';
import { API, withCookie } from '@/lib/server-auth';
export async function POST(req: NextRequest) {
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': req.headers.get('user-agent') ?? '',
    'x-forwarded-for': req.headers.get('x-forwarded-for') ?? '' }, body: await req.text() });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return NextResponse.json({ message: data.message ?? 'Login gagal' }, { status: r.status });
  const { refreshToken, ...rest } = data;
  return withCookie(NextResponse.json(rest), refreshToken);
}
