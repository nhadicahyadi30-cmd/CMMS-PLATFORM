import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import * as jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';
import { DbService } from '../db/db.service';
import { config } from '../config';
import { AuthUser } from './auth.types';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export interface Tokens { accessToken: string; refreshToken: string; expiresIn: number; user: AuthUser }

@Injectable()
export class AuthService {
  constructor(private db: DbService) {}

  async login(org: string, username: string, password: string, ip?: string, ua?: string): Promise<Tokens> {
    const p = this.db.authPool;
    const { rows } = await p.query(
      `select u.id, u.org_id, u.full_name, u.role_code, u.password_hash, u.active, u.failed_attempts, u.locked_until
         from users u join organizations o on o.id = u.org_id where o.slug = $1 and u.username = $2`, [org, username]);
    const u = rows[0];
    if (!u) { await argon2.hash(password).catch(() => undefined); throw new UnauthorizedException('Username atau password salah'); } // samarkan waktu respons
    if (u.locked_until && new Date(u.locked_until) > new Date())
      throw new HttpException('Akun terkunci sementara. Coba lagi nanti.', HttpStatus.LOCKED);
    const ok = u.active && (await argon2.verify(u.password_hash, password).catch(() => false));
    if (!ok) {
      await p.query(
        `update users set failed_attempts = failed_attempts + 1,
           locked_until = case when failed_attempts + 1 >= $2 then now() + make_interval(mins => $3) else locked_until end
         where id = $1`, [u.id, config.maxFailed, config.lockMinutes]);
      await this.audit(u.org_id, u.id, 'login_failed', ip);
      throw new UnauthorizedException('Username atau password salah');
    }
    await p.query('update users set failed_attempts = 0, locked_until = null, last_login_at = now() where id = $1', [u.id]);
    await this.audit(u.org_id, u.id, 'login', ip);
    return this.issue(u.id, ip, ua);
  }

  async refresh(token: string, ip?: string, ua?: string): Promise<Tokens> {
    const p = this.db.authPool;
    const { rows } = await p.query('select id, user_id, expires_at, revoked_at from refresh_tokens where token_hash = $1', [sha256(token)]);
    const r = rows[0];
    if (!r) throw new UnauthorizedException();
    if (r.revoked_at) {
      // token yang sudah dipakai dipakai lagi => kemungkinan dicuri: cabut semua sesi user ini
      await p.query('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [r.user_id]);
      throw new UnauthorizedException();
    }
    if (new Date(r.expires_at) < new Date()) throw new UnauthorizedException();
    await p.query('update refresh_tokens set revoked_at = now() where id = $1', [r.id]);
    return this.issue(r.user_id, ip, ua);
  }

  async logout(token: string) {
    await this.db.authPool.query('update refresh_tokens set revoked_at = now() where token_hash = $1 and revoked_at is null', [sha256(token)]);
  }

  private async issue(userId: string, ip?: string, ua?: string): Promise<Tokens> {
    const p = this.db.authPool;
    const { rows } = await p.query('select id, org_id, full_name, role_code, active from users where id = $1', [userId]);
    const u = rows[0];
    if (!u || !u.active) throw new UnauthorizedException();
    const mods = await p.query('select module from role_modules where org_id = $1 and role_code = $2 order by module', [u.org_id, u.role_code]);
    const pl = await p.query('select plant_id from user_plants where user_id = $1', [u.id]);
    const user: AuthUser = {
      sub: u.id, org: u.org_id, role: u.role_code, name: u.full_name,
      all: u.role_code === 'admin', plants: pl.rows.map((x: any) => x.plant_id), modules: mods.rows.map((x: any) => x.module),
    };
    const accessToken = jwt.sign(user, config.jwtAccess, { algorithm: 'HS256', expiresIn: config.accessTtlSec });
    const refreshToken = randomBytes(32).toString('base64url');
    await p.query(
      `insert into refresh_tokens (user_id, token_hash, expires_at, user_agent, ip) values ($1,$2, now() + make_interval(days => $3), $4, $5)`,
      [u.id, sha256(refreshToken), config.refreshTtlDays, ua?.slice(0, 300) ?? null, ip ?? null]);
    return { accessToken, refreshToken, expiresIn: config.accessTtlSec, user };
  }

  private audit(org: string, user: string, event: string, ip?: string) {
    return this.db.authPool.query('insert into audit_log (org_id, user_id, event, ip) values ($1,$2,$3,$4)', [org, user, event, ip ?? null]);
  }
}
