import { Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ComplianceAlertsService } from './compliance-alerts.service';
import { FieldAlertsService } from './field-alerts.service';

/**
 * Alertas de cumplimiento. Aloja los crons que evaluan los plazos por estado
 * (SLA) y los campos pendientes (`Project.fieldAlerts`) de cada actividad, y
 * envian los avisos por WhatsApp / correo. Depende de WhatsappModule y de
 * NotificationsModule (EmailService); FirebaseModule y ConfigModule son globales.
 */
@Module({
  imports: [WhatsappModule, NotificationsModule],
  providers: [ComplianceAlertsService, FieldAlertsService],
  exports: [ComplianceAlertsService, FieldAlertsService],
})
export class ComplianceModule {}
