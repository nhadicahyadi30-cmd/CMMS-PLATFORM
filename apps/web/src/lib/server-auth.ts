import { NextResponse } from 'next/server';
export const API = process.env.API_INTERNAL_URL ?? 'http://api:3001';
export const COOKIE = 'mh_rt';
export function withCookie(res: NextResponse, refreshToken: string | null) {
  res.cookies.set(COOKIE, refreshToken ?? '', {
    httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/auth',
    maxAge: refreshToken ? 14 * 24 * 3600 : 0,
  });
  return res;
}
