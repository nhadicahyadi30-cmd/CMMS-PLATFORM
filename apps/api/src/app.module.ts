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
import { InspectionsController } from './safety/inspections.controller';
import { PermitsController, LotoController } from './safety/permits.controller';
import { FieldController } from './safety/field.controller';
import { AiController, AlarmsController } from './ai/ai.controller';
import { AiService } from './ai/ai.service';
import { ImportController } from './import/import.controller';
import { IngestController } from './telemetry/ingest.controller';
import { TelemetryController } from './telemetry/telemetry.controller';
import { LeadsController } from './leads/leads.controller';
import { MailerService } from './reports/mailer';
import { ReportsController } from './reports/reports.controller';
import { ReportsScheduler } from './reports/reports.scheduler';
import { ReportsService } from './reports/reports.service';
import { StorageService } from './storage/storage.service';
import { AttachmentsService } from './storage/attachments.service';
import { AttachmentsController } from './storage/attachments.controller';
import { NotificationsController } from './notifications/notifications.controller';
import { WorkforceController } from './workforce/workforce.controller';
import { WhatsappProcessor } from './whatsapp/whatsapp.processor';
import { WhatsappService } from './whatsapp/whatsapp.service';

@Module({
  controllers: [AuthController, LeadsController, IngestController, TelemetryController, KpiController, RcaController, FailureModesController, EnergyController, AiController, AlarmsController, ImportController, ReportsController, InventoryController, WoPartsController, AdminController, AttachmentsController, PlantsController, TechniciansController, AssetsController, WorkOrdersController, PmController, WorkforceController, NotificationsController, WhatsappController, InspectionsController, PermitsController, LotoController, FieldController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }, DbService, AiService, AuthService, WhatsappService, WhatsappProcessor, StorageService, AttachmentsService, MailerService, ReportsService, ReportsScheduler],
})
export class AppModule {}
