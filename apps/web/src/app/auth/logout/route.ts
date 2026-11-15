import { NextRequest, NextResponse } from 'next/server';
import { API, COOKIE, withCookie } from '@/lib/server-auth';
export async function POST(req: NextRequest) {
  const rt = req.cookies.get(COOKIE)?.value;
  if (rt) await fetch(`${API}/auth/logout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) }).catch(() => undefined);
  return withCookie(new NextResponse(null, { status: 204 }), null);
}
