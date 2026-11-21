import { Body, Controller, Get, HttpException, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../db/db.service';
import { dbCtx, RequireModule, Roles } from '../auth/auth.guard';
import { mapDbError, parse } from '../common/http';

const PlanDto = z.object({
  plantId: z.string().uuid(), assetId: z.string().uuid(), name: z.string().trim().min(3).max(200),
  triggerType: z.enum(['calendar', 'meter']),
  intervalDays: z.number().int().min(1).max(3650).optional(),
  intervalMeter: z.number().positive().optional(), meterId: z.string().uuid().optional(),
  priority: z.enum(['P1', 'P2', 'P3', 'P4']).default('P3'), estHours: z.number().positive().max(999).default(2),
  leadDays: z.number().int().min(0).max(60).default(3),
  checklist: z.array(z.string().max(300)).max(50).default([]),
  nextDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  skillId: z.string().uuid().nullable().optional(), skillMinLevel: z.number().int().min(1).max(4).default(2),
});

const COLS = `p.id, p.plant_id as "plantId", p.asset_id as "assetId", a.name as "assetName", p.name, p.trigger_type as "triggerType",
  p.interval_days as "intervalDays", p.interval_meter as "intervalMeter", p.priority, p.est_hours as "estHours", p.lead_days as "leadDays",
  p.checklist, p.skill_id as "skillId", (select k.code from skills k where k.id = p.skill_id) as "skillCode", p.skill_min_level as "skillMinLevel", p.next_due as "nextDue", p.last_done as "lastDone", p.active`;

@Controller('pm')
@RequireModule(2)
export class PmController {
  constructor(private db: DbService) {}

  @Get('plans')
  list(@Query('plantId') plantId: string | undefined, @Req() req: any) {
    return this.db.tx(dbCtx(req.user), async (c) => {
      const r = await c.query(
        `select ${COLS} from pm_plans p join assets a on a.id = p.asset_id ${plantId ? 'where p.plant_id = $1' : ''} order by p.next_due nulls last`,
        plantId ? [plantId] : []);
      return r.rows;
    });
  }

  @Post('plans') @Roles('admin', 'supervisor', 'planner')
  async create(@Body() b: unknown, @Req() req: any) {
    const d = parse(PlanDto, b);
    try {
      return await this.db.tx(dbCtx(req.user), async (c) => {
        const r = await c.query(
          `insert into pm_plans (org_id, plant_id, asset_id, name, trigger_type, interval_days, interval_meter, meter_id, priority, est_hours, lead_days, checklist, next_due, skill_id, skill_min_level)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, coalesce($13::date, case when $5='calendar' then current_date + $6::int end), $14, $15) returning id`,
          [req.user.org, d.plantId, d.assetId, d.name, d.triggerType, d.intervalDays ?? null, d.intervalMeter ?? null, d.meterId ?? null,
           d.priority, d.estHours, d.leadDays, JSON.stringify(d.checklist), d.nextDue ?? null, d.skillId ?? null, d.skillMinLevel]);
        return r.rows[0];
      });
    } catch (e) { mapDbError(e); }
  }

  @Patch('plans/:id/active') @Roles('admin', 'supervisor', 'planner')
  setActive(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) {
    const { active } = parse(z.object({ active: z.boolean() }), b);
    return this.db.tx(dbCtx(req.user), async (c) => (await c.query('update pm_plans set active = $1 where id = $2 returning id, active', [active, id])).rows[0]);
  }

  /** Dipicu manual atau oleh cron eksternal (mis. tiap pagi). Aman dijalankan berulang. */
  @Post('generate') @Roles('admin', 'supervisor', 'planner')
  generate(@Req() req: any) {
    return this.db.tx(dbCtx(req.user), async (c) => {
      const r = await c.query('select pm_generate($1) as created', [req.user.org]);
      return { created: r.rows[0].created };
    });
  }

  /** BOM suku cadang rencana PM, lengkap dengan stok dan kekurangan. */
  @Get('plans/:id/parts')
  bom(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.db.tx(dbCtx(req.user), async (c) => (await c.query(
      `select b.part_id as "partId", p.code, p.name, p.unit, b.qty, p.on_hand as "onHand", greatest(b.qty - p.on_hand, 0) as shortage
         from pm_parts b join parts p on p.id = b.part_id where b.pm_plan_id = $1 order by p.code`, [id])).rows);
  }

  @Put('plans/:id/parts') @Roles('admin', 'supervisor', 'planner')
  async setBom(@Param('id', ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: any) {
    const items = parse(z.array(z.object({ partId: z.string().uuid(), qty: z.number().positive().max(100000) })).max(100), b);
    try {
      return await this.db.tx(dbCtx(req.user), async (c) => {
        const plan = await c.query('select plant_id from pm_plans where id = $1', [id]);
        if (!plan.rows[0]) throw new HttpException('Rencana PM tidak ditemukan', HttpStatus.NOT_FOUND);
        await c.query('delete from pm_parts where pm_plan_id = $1', [id]);
        for (const it of items) {
          const ok = await c.query('select 1 from parts where id = $1 and plant_id = $2', [it.partId, plan.rows[0].plant_id]);
          if (!ok.rows[0]) throw new HttpException('Suku cadang tidak ditemukan di plant rencana ini', HttpStatus.UNPROCESSABLE_ENTITY);
          await c.query('insert into pm_parts (org_id, pm_plan_id, part_id, qty) values ($1,$2,$3,$4)', [req.user.org, id, it.partId, it.qty]);
        }
        return { count: items.length };
      });
    } catch (e) { mapDbError(e); }
  }
}
