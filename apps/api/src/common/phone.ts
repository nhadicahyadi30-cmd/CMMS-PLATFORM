/** 08xxxxxxxx / 62xxxxxxxx / +62xxxxxxxx -> format E.164 (+62...). */
export function normalizePhone(raw: string): string {
  const d = raw.replace(/[\s().-]/g, '');
  if (d.startsWith('+')) return d;
  if (d.startsWith('0')) return '+62' + d.slice(1);
  if (d.startsWith('62')) return '+' + d;
  return '+' + d;
}
