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
import { AdminController } from './admin/admin.controller';
import { InventoryController } from './inventory/inventory.controller';
import { WoPartsController } from './inventory/wo-parts.controller';
import { KpiController } from './kpi/kpi.controller';
import { RcaController, FailureModesController } from './rca/rca.controller';
import { EnergyController } from './energy/energy.controller';
import { AiController, AlarmsController } from './ai/ai.controller';
import { AiService } from './ai/ai.service';
import { StorageService } from './storage/storage.service';
import { AttachmentsService } from './storage/attachments.service';
import { AttachmentsController } from './storage/attachments.controller';
import { WhatsappProcessor } from './whatsapp/whatsapp.processor';
import { WhatsappService } from './whatsapp/whatsapp.service';

@Module({
  controllers: [AuthController, KpiController, RcaController, FailureModesController, EnergyController, AiController, AlarmsController, InventoryController, WoPartsController, AdminController, AttachmentsController, PlantsController, TechniciansController, AssetsController, WorkOrdersController, PmController, WhatsappController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }, DbService, AiService, AuthService, WhatsappService, WhatsappProcessor, StorageService, AttachmentsService],
})
export class AppModule {}
