/**
 * Membuat organisasi pertama + plant + akun Admin.
 *   OWNER_DATABASE_URL=postgres://owner:pw@db:5432/maintainhub \
 *   node dist/cli/bootstrap.js --org pilot-fnb --name "Nama Perusahaan" --plant P1 --plant-name "Plant 1" --admin admin
 * Password diambil dari BOOTSTRAP_ADMIN_PASSWORD; bila kosong dibuat acak dan dicetak SEKALI.
 */
import { Client } from 'pg';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';

function arg(name: string, def?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : def;
  if (!v) { console.error(`Argumen --${name} wajib diisi`); process.exit(2); }
  return v;
}

async function main() {
  const url = process.env.OWNER_DATABASE_URL;
  if (!url) { console.error('OWNER_DATABASE_URL belum diisi (koneksi pemilik database, bukan role aplikasi)'); process.exit(2); }
  const slug = arg('org'), name = arg('name'), plantCode = arg('plant', 'P1'), plantName = arg('plant-name', 'Plant 1'), admin = arg('admin', 'admin');
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) { console.error('Slug organisasi: 2–40 karakter huruf kecil, angka, minus'); process.exit(2); }
  if (!/^[a-z0-9._-]{3,40}$/.test(admin)) { console.error('Username admin: 3–40 karakter huruf kecil, angka, . _ -'); process.exit(2); }
  const generated = !process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? randomBytes(15).toString('base64url');
  if (password.length < 10) { console.error('Password minimal 10 karakter'); process.exit(2); }
  const hash = await argon2.hash(password, { type: argon2.argon2id });

  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    await c.query('begin');
    const exists = await c.query('select 1 from organizations where slug = $1', [slug]);
    if (exists.rowCount) throw new Error(`Organisasi "${slug}" sudah ada`);
    const org = (await c.query('select provision_org($1, $2) as id', [slug, name])).rows[0].id;
    await c.query('insert into plants (org_id, code, name) values ($1,$2,$3)', [org, plantCode, plantName]);
    await c.query(`insert into users (org_id, username, full_name, role_code, password_hash) values ($1,$2,'Administrator','admin',$3)`, [org, admin, hash]);
    await c.query('commit');
    console.log(`Organisasi "${slug}" dibuat.\nLogin: organisasi=${slug} username=${admin}`);
    if (generated) console.log(`Password sementara (catat sekarang, tidak akan ditampilkan lagi): ${password}`);
  } catch (e: any) {
    await c.query('rollback').catch(() => undefined);
    console.error('Gagal:', e.message); process.exitCode = 1;
  } finally { await c.end(); }
}
main();
