import { Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { NotificationsService } from './notifications.service';
import { EmailService } from './email.service';

/**
 * Notificaciones de dominio (asignacion de responsables, etc.). Depende de
 * WhatsappModule para el envio y las plantillas. Lo consumen ActivitiesModule
 * y el motor de reglas para avisar a los responsables. Incluye el canal de
 * correo (EmailService / Amazon SES).
 */
@Module({
  imports: [WhatsappModule],
  providers: [NotificationsService, EmailService],
  exports: [NotificationsService, EmailService],
})
export class NotificationsModule {}
