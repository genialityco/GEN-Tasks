import { Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { NotificationsService } from './notifications.service';

/**
 * Notificaciones de dominio (asignacion de responsables, etc.). Depende de
 * WhatsappModule para el envio y las plantillas. Lo consumen ActivitiesModule
 * y el motor de reglas para avisar a los responsables.
 */
@Module({
  imports: [WhatsappModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
