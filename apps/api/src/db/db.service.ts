import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { config } from '../config';

export interface DbContext { orgId: string; plantIds: string[]; allPlants: boolean }

@Injectable()
export class DbService implements OnModuleDestroy {
  private app?: Pool;
  private auth?: Pool;
  private get appPool() { return (this.app ??= new Pool({ connectionString: config.dbUrl, max: 10 })); }
  /** Pool role maintainhub_auth: hanya untuk login/refresh (akses lintas-org yang terbatas). */
  get authPool() { return (this.auth ??= new Pool({ connectionString: config.authDbUrl, max: 3 })); }

  /** Satu transaksi dengan konteks RLS (org + plant). Semua query bisnis WAJIB lewat sini. */
  async tx<T>(ctx: DbContext, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.appPool.connect();
    try {
      await c.query('begin');
      await c.query(
        `select set_config('app.org_id', $1, true), set_config('app.plant_ids', $2, true), set_config('app.all_plants', $3, true)`,
        [ctx.orgId, ctx.plantIds.join(','), ctx.allPlants ? '1' : '0'],
      );
      const r = await fn(c);
      await c.query('commit');
      return r;
    } catch (e) {
      await c.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
  }

  async onModuleDestroy() { await Promise.all([this.app?.end(), this.auth?.end()]); }
}
