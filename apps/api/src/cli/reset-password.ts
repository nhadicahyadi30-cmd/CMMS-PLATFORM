/**
 * Mengatur ulang password pengguna (dan membuka kunci akun).
 *   OWNER_DATABASE_URL=postgres://owner:pw@db:5432/maintainhub \
 *   RESET_PASSWORD='PasswordBaru123' \
 *   node dist/cli/reset-password.js --org demo --users admin,spv.pa,plan.pa
 * --users boleh berisi beberapa username dipisah koma.
 */
import { Client } from 'pg';
import * as argon2 from 'argon2';

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (!v) { console.error(`Argumen --${name} wajib diisi`); process.exit(2); }
  return v;
}

async function main() {
  const url = process.env.OWNER_DATABASE_URL;
  const password = process.env.RESET_PASSWORD;
  if (!url) { console.error('OWNER_DATABASE_URL belum diisi'); process.exit(2); }
  if (!password || password.length < 10) { console.error('RESET_PASSWORD wajib diisi, minimal 10 karakter'); process.exit(2); }
  const slug = arg('org');
  const users = arg('users').split(',').map((s) => s.trim()).filter(Boolean);
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const r = await c.query(
      `update users set password_hash = $1, failed_attempts = 0, locked_until = null
        where org_id = (select id from organizations where slug = $2) and username = any($3::text[])
        returning username`, [hash, slug, users]);
    const done = r.rows.map((x) => x.username);
    console.log(`Password diubah untuk: ${done.join(', ') || '(tidak ada)'}`);
    const miss = users.filter((u) => !done.includes(u));
    if (miss.length) { console.error(`Tidak ditemukan: ${miss.join(', ')}`); process.exitCode = 1; }
  } finally { await c.end(); }
}
main();
