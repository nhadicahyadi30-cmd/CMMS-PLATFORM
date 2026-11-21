import { Controller, Get, Req } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { dbCtx } from '../auth/auth.guard';
import { mapDbError } from '../common/http';
import { audiencesFor } from './inspection.rules';

/** Paket data untuk mode offline: diunduh saat ada sinyal, dipakai di lapangan tanpa sinyal. */
@Controller('field')
export class FieldController {
  constructor(private db: DbService) {}

  @Get('pack')
  pack(@Req() req: any) {
    const u = req.user;
    return this.db.tx(dbCtx(u), async (c) => {
      let templates: any[] = []; let assets: any[] = []; let workOrders: any[] = [];
      if (u.modules.includes(11)) {
        const t = await c.query(
          `select t.id, t.code, t.name, t.description, t.plant_id as "plantId", t.asset_id as "assetId", t.audience, t.frequency_days as "frequencyDays",
                  (select coalesce(json_agg(json_build_object('id', i.id, 'seq', i.seq, 'text', i.text, 'kind', i.kind, 'unit', i.unit, 'minVal', i.min_val::float, 'maxVal', i.max_val::float,
                                                              'required', i.required, 'critical', i.critical) order by i.seq), '[]'::json) from inspection_items i where i.template_id = t.id) as items
             from inspection_templates t where t.active and t.audience = any($1) order by t.code`, [audiencesFor(u.role)]);
        templates = t.rows;
        const a = await c.query(`select id, code, name, plant_id as "plantId" from assets where status <> 'retired' and asset_type in ('equipment','component') order by code limit 3000`);
        assets = a.rows;
      }
      if (u.modules.includes(3) && u.role !== 'production') {
        const w = await c.query(
          `select w.id, w.code, w.title, w.description, w.priority, w.status, w.wo_type as "woType", w.asset_id as "assetId", a.name as "assetName", w.est_hours::float as "estHours"
             from work_orders w join assets a on a.id = w.asset_id
            where w.status in ('assigned','progress') and w.technician_id = (select id from technicians where user_id = $1 and active) order by w.priority, w.created_at limit 100`, [u.sub]);
        workOrders = w.rows;
      }
      return { user: { name: u.name, role: u.role, plants: u.plants, modules: u.modules }, generatedAt: new Date().toISOString(), templates, assets, workOrders };
    }).catch((e) => mapDbError(e));
  }
}
