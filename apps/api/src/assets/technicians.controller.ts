import { Controller, Get, Query, Req } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { dbCtx } from '../auth/auth.guard';

/** Daftar teknisi untuk penugasan WO (modul 3). Nomor telepon tidak ikut dikirim ke browser. */
@Controller('technicians')
export class TechniciansController {
  constructor(private db: DbService) {}
  @Get()
  list(@Query('plantId') plantId: string | undefined, @Req() req: any) {
    return this.db.tx(dbCtx(req.user), async (c) => {
      const r = await c.query(
        `select id, code, full_name as "fullName", skill, shift, plant_id as "plantId" from technicians where active ${plantId ? 'and plant_id = $1' : ''} order by full_name`,
        plantId ? [plantId] : []);
      return r.rows;
    });
  }
}
