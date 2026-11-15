import { Body, Controller, Get, HttpException, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import * as argon2 from 'argon2';
import { PoolClient } from 'pg';
import { DbService } from '../db/db.service';
import { dbCtx, RequireModule, Roles } from '../auth/auth.guard';
import { mapDbError, parse } from '../common/http';

const ROLE = z.enum(['admin', 'supervisor', 'planner', 'technician']);
const PASSWORD = z.string().min(10, 'Password minimal 10 karakter').max(128);
const UserCreate = z.object({
  username: z.string().regex(/^[a-z0-9._-]{3,40}$/, 'Username 3–40 karakter: huruf kecil, angka, titik, minus, garis bawah'),
  fullName: z.string().trim().min(2).max(120), email: z.string().email().max(200).optional(),
  role: ROLE, password: PASSWORD, plantIds: z.array(z.string().uuid()).max(100).default([]),
});
const UserPatch = z.object({
  fullName: z.string().trim().min(2).max(120).optional(), email: z.string().email().max(200).nullable().optional(),
  role: ROLE.optional(), active: z.boolean().optional(), plantIds: z.array(z.string().uuid()).max(100).optional(),
});
const PlantCreate = z.object({ code: z.string().regex(/^[A-Za-z0-9-]{1,10}$/, 'Kode plant 1–10 huruf/angka'), name: z.string().trim().min(2).max(120), address: z.string().max(300).optional() });

/** 08xxxxxxxx / 62xxxxxxxx / +62xxxxxxxx -> format E.164 (+62...). */
export function normalizePhone(raw: string): string {
  const d = raw.replace(/[\s().-]/g, '');
  if (d.startsWith('+')) return d;
  if (d.startsWith('0')) return '+62' + d.slice(1);
  if (d.startsWith('62')) return '+' + d;
  return '+' + d;
}
const Phone = z.string().transform(normalizePhone).refine((v) => /^\+[1-9][0-9]{7,14}$/.test(v), 'Nomor telepon tidak valid');
const TechCreate = z.object({
  plantId: z.string().uuid(), code: z.string().regex(/^[A-Za-z0-9-]{1,20}$/), fullName: z.string().trim().min(2).max(120),
  skill: z.string().trim().min(2).max(60), shift: z.enum(['pagi', 'siang', 'malam']), userId: z.string().uuid().nullish(), phone: Phone.nullish(),
});
const TechPatch = z.object({
  fullName: z.string().trim().min(2).max(120).optional(), skill: z.string().trim().min(2).max(60).optional(), shift: z.enum(['pagi', 'siang', 'malam']).optional(),
  userId: z.string().uuid().nullable().optional(), phone: Phone.nullable().optional(), waOptIn: z.boolean().optional(), active: z.boolean().optional(),
});

@Controller('admin')
@RequireModule(10)
@Roles('admin')
export class AdminController {
  constructor(private db: DbService) {}

  private hash(pw: string) { return argon2.hash(pw, { type: argon2.argon2id }); }
  private audit(c: PoolClient, u: any, event: string, entity: string, id: string, detail: object = {}) {
    return c.query('insert into audit_log (org_id, user_id, event, entity, entity_id, detail) values ($1,$2,$3,$4,$5,$6)', [u.org, u.sub, event, entity, id, JSON.stringify(detail)]);
  }
  private async revokeSessions(userId: string) {
    await this.db.authPool.query('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [userId]);
  }
  private checkPassword(pw: string, username?: string) {
    if (username && pw.toLowerCase().includes(username.toLowerCase())) throw new HttpException('Password tidak boleh mengandung username', HttpStatus.UNPROCESSABLE_ENTITY);
  }
  private async setPlants(c: PoolClient, userId: string, plantIds: string[]) {
    await c.query('delete from user_plants where user_id = $1', [userId]);
    if (plantIds.length) await c.query('insert into user_plants (user_id, plant_id) select $1, unnest($2::uuid[])', [userId, plantIds]);
  }

  // ---------- pengguna ----------
  @Get('users')
  users(@Req() req: any) {
    return this.db.tx(dbCtx(req.user), async (c) => (await c.query(
      `select u.id, u.username, u.full_name as "fullName", u.email, u.role_code as role, u.active, u.locked_until as "lockedUntil", u.last_login_at as "lastLoginAt",
              coalesce(array_agg(up.plant_id) filter (where up.plant_id is not null), '{}') as "plantIds"
         from users u left join user_plants up on up.user_id = u.id group by u.id order by u.username`)).rows);
  }

  @Post('users')
  async createUser(@Body() b: unknown, @Req() req: any) {
    const d = parse(UserCreate, b); this.checkPassword(d.password, d.username);
    const hash = await this.hash(d.password);
    try {
      return await this.db.tx(dbCtx(req.user), async (c) => {
        const r = await c.query(`insert into users (org_id, username, full_name, email, role_code, password_hash) values ($1,$2,$3,$4,$5,$6) returning id, username`,
          [req.user.org, d.username, d.fullName, d.email ?? null, d.role, hash]);
        if (d.role !== 'admin') await this.setPlants(c, r.rows[0].id, d.plantIds);
        await this.audit(c, req.user, 'user_create', 'user', r.rows[0].id, { role: d.role });
        return r.rows[0];
      });
    } catch (e) { mapDbError(e); }
  }

  @Patch('users/:id')
  async updateUser(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) {
    const d = parse(UserPatch, b); const me = req.user;
    try {
      const out = await this.db.tx(dbCtx(me), async (c) => {
        const cur = (await c.query('select role_code, active from users where id = $1', [id])).rows[0];
        if (!cur) throw new HttpException('Pengguna tidak ditemukan', HttpStatus.NOT_FOUND);
        const losesAdmin = cur.role_code === 'admin' && cur.active && ((d.role && d.role !== 'admin') || d.active === false);
        if (losesAdmin) {
          if (id === me.sub) throw new HttpException('Tidak bisa menurunkan atau menonaktifkan akun Anda sendiri', HttpStatus.UNPROCESSABLE_ENTITY);
          const others = await c.query(`select count(*)::int as n from users where role_code = 'admin' and active and id <> $1`, [id]);
          if (others.rows[0].n < 1) throw new HttpException('Harus tersisa minimal satu Admin aktif', HttpStatus.UNPROCESSABLE_ENTITY);
        }
        const sets: string[] = []; const args: unknown[] = [];
        const add = (col: string, v: unknown) => { args.push(v); sets.push(`${col} = $${args.length}`); };
        if (d.fullName !== undefined) add('full_name', d.fullName);
        if (d.email !== undefined) add('email', d.email);
        if (d.role !== undefined) add('role_code', d.role);
        if (d.active !== undefined) add('active', d.active);
        if (sets.length) { args.push(id); await c.query(`update users set ${sets.join(', ')} where id = $${args.length}`, args); }
        if (d.plantIds) await this.setPlants(c, id, d.plantIds);
        await this.audit(c, me, 'user_update', 'user', id, { fields: Object.keys(d) });
        return { id, deactivated: d.active === false || (d.role !== undefined && cur.role_code !== d.role) };
      });
      if (out.deactivated) await this.revokeSessions(id); // paksa login ulang agar izin baru berlaku
      return { id };
    } catch (e) { mapDbError(e); }
  }

  @Post('users/:id/reset-password')
  async resetPassword(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) {
    const { password } = parse(z.object({ password: PASSWORD }), b);
    const hash = await this.hash(password);
    try {
      await this.db.tx(dbCtx(req.user), async (c) => {
        const r = await c.query('select username from users where id = $1', [id]);
        if (!r.rows[0]) throw new HttpException('Pengguna tidak ditemukan', HttpStatus.NOT_FOUND);
        this.checkPassword(password, r.rows[0].username);
        await c.query('update users set password_hash = $2, failed_attempts = 0, locked_until = null where id = $1', [id, hash]);
        await this.audit(c, req.user, 'password_reset', 'user', id);
      });
      await this.revokeSessions(id);
      return { ok: true };
    } catch (e) { mapDbError(e); }
  }

  @Post('users/:id/unlock')
  unlock(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.db.tx(dbCtx(req.user), async (c) => {
      const r = await c.query('update users set failed_attempts = 0, locked_until = null where id = $1 returning id', [id]);
      if (!r.rows[0]) throw new HttpException('Pengguna tidak ditemukan', HttpStatus.NOT_FOUND);
      await this.audit(c, req.user, 'user_unlock', 'user', id);
      return { ok: true };
    });
  }

  // ---------- plant ----------
  @Get('plants')
  plants(@Req() req: any) {
    return this.db.tx(dbCtx(req.user), async (c) => (await c.query('select id, code, name, address, active from plants order by code')).rows);
  }

  @Post('plants')
  async createPlant(@Body() b: unknown, @Req() req: any) {
    const d = parse(PlantCreate, b);
    try {
      return await this.db.tx(dbCtx(req.user), async (c) => {
        const r = await c.query('insert into plants (org_id, code, name, address) values ($1,$2,$3,$4) returning id, code, name', [req.user.org, d.code, d.name, d.address ?? null]);
        await this.audit(c, req.user, 'plant_create', 'plant', r.rows[0].id);
        return r.rows[0];
      });
    } catch (e) { mapDbError(e); }
  }

  // ---------- teknisi (profil lapangan + nomor WhatsApp) ----------
  @Get('technicians')
  technicians(@Req() req: any) {
    return this.db.tx(dbCtx(req.user), async (c) => (await c.query(
      `select id, code, full_name as "fullName", skill, shift, plant_id as "plantId", user_id as "userId", phone_e164 as phone, wa_opt_in as "waOptIn", active
         from technicians order by code`)).rows);
  }

  @Post('technicians')
  async createTech(@Body() b: unknown, @Req() req: any) {
    const d = parse(TechCreate, b);
    try {
      return await this.db.tx(dbCtx(req.user), async (c) => {
        const r = await c.query(`insert into technicians (org_id, plant_id, user_id, code, full_name, skill, shift, phone_e164) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id, code`,
          [req.user.org, d.plantId, d.userId ?? null, d.code, d.fullName, d.skill, d.shift, d.phone ?? null]);
        await this.audit(c, req.user, 'technician_create', 'technician', r.rows[0].id);
        return r.rows[0];
      });
    } catch (e) { mapDbError(e); }
  }

  @Patch('technicians/:id')
  async updateTech(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) {
    const d = parse(TechPatch, b);
    try {
      return await this.db.tx(dbCtx(req.user), async (c) => {
        const sets: string[] = []; const args: unknown[] = [];
        const add = (col: string, v: unknown) => { args.push(v); sets.push(`${col} = $${args.length}`); };
        if (d.fullName !== undefined) add('full_name', d.fullName);
        if (d.skill !== undefined) add('skill', d.skill);
        if (d.shift !== undefined) add('shift', d.shift);
        if (d.userId !== undefined) add('user_id', d.userId);
        if (d.phone !== undefined) add('phone_e164', d.phone);
        if (d.active !== undefined) add('active', d.active);
        // opt-in WhatsApp: hanya sah bila ada nomor; waktu persetujuan dicatat
        if (d.waOptIn !== undefined) { add('wa_opt_in', d.waOptIn); sets.push(d.waOptIn ? 'wa_opt_in_at = coalesce(wa_opt_in_at, now())' : 'wa_opt_in_at = null'); }
        if (d.phone === null && d.waOptIn === undefined) { sets.push('wa_opt_in = false', 'wa_opt_in_at = null'); }
        if (d.waOptIn === true) {
          const phone = d.phone !== undefined ? d.phone : (await c.query('select phone_e164 from technicians where id = $1', [id])).rows[0]?.phone_e164;
          if (!phone) throw new HttpException('Isi nomor telepon sebelum mengaktifkan WhatsApp', HttpStatus.UNPROCESSABLE_ENTITY);
        }
        if (!sets.length) throw new HttpException('Tidak ada perubahan', HttpStatus.BAD_REQUEST);
        args.push(id);
        const r = await c.query(`update technicians set ${sets.join(', ')} where id = $${args.length} returning id`, args);
        if (!r.rows[0]) throw new HttpException('Teknisi tidak ditemukan', HttpStatus.NOT_FOUND);
        await this.audit(c, req.user, 'technician_update', 'technician', id, { fields: Object.keys(d) });
        return { id };
      });
    } catch (e) { mapDbError(e); }
  }
}
