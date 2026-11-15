import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { config } from '../config';
import { AuthUser } from './auth.types';
import { DbContext } from '../db/db.service';

export const REQ_MODULE = 'req_module';
export const REQ_ROLES = 'req_roles';
/** Wajib punya akses modul n (matriks role_modules). */
export const RequireModule = (n: number) => SetMetadata(REQ_MODULE, n);
/** Batasi ke role tertentu. */
export const Roles = (...r: AuthUser['role'][]) => SetMetadata(REQ_ROLES, r);
export const PUBLIC = 'public';
export const Public = () => SetMetadata(PUBLIC, true);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const h = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride(PUBLIC, h)) return true;
    const req = ctx.switchToHttp().getRequest();
    const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
    if (!m) throw new UnauthorizedException();
    let u: AuthUser;
    try { u = jwt.verify(m[1], config.jwtAccess, { algorithms: ['HS256'] }) as unknown as AuthUser; }
    catch { throw new UnauthorizedException(); }
    req.user = u;
    const mod = this.reflector.getAllAndOverride<number | undefined>(REQ_MODULE, h);
    if (mod && !u.modules.includes(mod)) throw new ForbiddenException('Tidak punya akses ke modul ini');
    const roles = this.reflector.getAllAndOverride<string[] | undefined>(REQ_ROLES, h);
    if (roles && !roles.includes(u.role)) throw new ForbiddenException('Peran tidak diizinkan');
    return true;
  }
}

export function dbCtx(u: AuthUser): DbContext {
  return { orgId: u.org, plantIds: u.plants, allPlants: u.all };
}
