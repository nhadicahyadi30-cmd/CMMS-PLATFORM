function need(name: string): string {
  const v = process.env[name];
  if (!v || v.startsWith('CHANGE_ME')) throw new Error(`Variabel lingkungan ${name} belum diisi`);
  return v;
}
export const config = {
  get dbUrl() { return need('DATABASE_URL'); },
  get authDbUrl() { return need('AUTH_DATABASE_URL'); },
  get jwtAccess() { return need('JWT_ACCESS_SECRET'); },
  accessTtlSec: 15 * 60,
  refreshTtlDays: 14,
  maxFailed: 5,
  lockMinutes: 15,
  wa: {
    phoneId: process.env.WA_PHONE_NUMBER_ID ?? '',
    token: process.env.WA_ACCESS_TOKEN ?? '',
    appSecret: process.env.WA_APP_SECRET ?? '',
    verifyToken: process.env.WA_VERIFY_TOKEN ?? '',
  },
};
