import { Controller, Get, Req } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { dbCtx } from '../auth/auth.guard';

/** Plant yang boleh diakses user login (disaring RLS). */
@Controller('plants')
export class PlantsController {
  constructor(private db: DbService) {}
  @Get()
  list(@Req() req: any) {
    return this.db.tx(dbCtx(req.user), async (c) => (await c.query('select id, code, name from plants where active order by code')).rows);
  }
}
