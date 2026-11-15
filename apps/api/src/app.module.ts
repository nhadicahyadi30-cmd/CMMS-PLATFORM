import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard';
import { DbService } from './db/db.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { TechniciansController } from './assets/technicians.controller';
import { PlantsController } from './assets/plants.controller';
import { AssetsController } from './assets/assets.controller';
import { WorkOrdersController } from './work-orders/work-orders.controller';
import { PmController } from './pm/pm.controller';
import { WhatsappController } from './whatsapp/whatsapp.controller';
import { WhatsappService } from './whatsapp/whatsapp.service';

@Module({
  controllers: [AuthController, PlantsController, TechniciansController, AssetsController, WorkOrdersController, PmController, WhatsappController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }, DbService, AuthService, WhatsappService],
})
export class AppModule {}
