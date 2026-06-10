import { Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { ComplianceAlertsService } from './compliance-alerts.service';

/**
 * Alertas de cumplimiento por estado (SLA). Aloja el cron que evalua los plazos
 * por estado de cada actividad y envia los WhatsApp de incumplimiento. Depende
 * de WhatsappModule para el envio; FirebaseModule y ConfigModule son globales.
 */
@Module({
  imports: [WhatsappModule],
  providers: [ComplianceAlertsService],
  exports: [ComplianceAlertsService],
})
export class ComplianceModule {}
