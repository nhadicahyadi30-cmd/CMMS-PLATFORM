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
  s3: {
    get endpoint() { return process.env.S3_ENDPOINT || undefined; },
    region: process.env.S3_REGION ?? 'us-east-1',
    get bucket() { return need('S3_BUCKET'); },
    get accessKey() { return need('S3_ACCESS_KEY'); },
    get secretKey() { return need('S3_SECRET_KEY'); },
  },
  ai: {
    key: process.env.ANTHROPIC_API_KEY ?? '',
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
    maxTokens: 1024,
    perHour: Number(process.env.AI_MAX_PER_HOUR) > 0 ? Number(process.env.AI_MAX_PER_HOUR) : 60,
    timeoutMs: 30_000,
  },
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',            // true = TLS langsung (port 465); false = STARTTLS (587)
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? '',
  },
  leadsNotifyTo: process.env.LEADS_NOTIFY_EMAIL ?? '',   // opsional: email pemilik yang diberi tahu saat ada permintaan demo
  reportsScheduler: process.env.REPORTS_SCHEDULER !== 'off',
  maxUploadBytes: 10 * 1024 * 1024,
  wa: {
    phoneId: process.env.WA_PHONE_NUMBER_ID ?? '',
    token: process.env.WA_ACCESS_TOKEN ?? '',
    appSecret: process.env.WA_APP_SECRET ?? '',
    verifyToken: process.env.WA_VERIFY_TOKEN ?? '',
  },
};
