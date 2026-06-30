import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Activity,
  FirestoreCollections,
  NotificationChannel,
  Organization,
  Project,
  User,
} from '@gen-task/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { docToEntity } from '../firebase/firestore.helpers';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { MessageTemplatesService } from '../whatsapp/message-templates.service';
import { EmailService } from './email.service';
import { buildActivityVars, interpolate } from '../common/template-vars';
import { normalizePhoneForWhatsApp } from '../common/phone';

/**
 * Claves logicas de las plantillas de notificacion. Cada clave puede tener una
 * plantilla configurable por organizacion (coleccion message_templates); si no
 * existe, se usa el cuerpo por defecto definido en DEFAULT_TEMPLATES.
 */
export const NotificationTemplateKey = {
  /** Se envia al usuario cuando es asignado como responsable de una actividad. */
  RESPONSIBLE_ASSIGNED: 'RESPONSIBLE_ASSIGNED',
} as const;

/** Cuerpos por defecto usados cuando la organizacion no configura una plantilla. */
const DEFAULT_TEMPLATES: Record<string, string> = {
  [NotificationTemplateKey.RESPONSIBLE_ASSIGNED]:
    'Hola {{responsibleName}} 👋\n' +
    'Se te ha asignado como responsable de la actividad *{{activityName}}* ' +
    'en el proyecto *{{projectName}}* ({{organizationName}}).\n' +
    'Estado actual: {{statusName}}.\n' +
    'Abrela aqui: {{link}}',
};

/** Contexto para renderizar la notificacion de asignacion de responsable. */
interface ResponsibleAssignedContext {
  activity: Activity;
  project: Project;
  /** Ids de usuarios recien asignados (no toda la lista de responsables). */
  responsibleUserIds: string[];
  /**
   * Canal de entrega forzado por quien dispara la notificacion (p. ej. la regla
   * "Notificar a"). Si se define, tiene prioridad sobre el canal de la plantilla.
   * Si no, se usa el canal de la plantilla y, en su defecto, WhatsApp.
   */
  channel?: NotificationChannel;
  /**
   * Mensaje propio de la regla "Notificar a" (admite variables). Si viene con
   * texto, reemplaza al cuerpo de la plantilla RESPONSIBLE_ASSIGNED; si no, se
   * usa la plantilla (o su texto por defecto).
   */
  messageOverride?: string;
  /** Solo ON_STATUS_CHANGED: estado origen ({{fromStatusName}}). */
  fromStatusName?: string;
  /** Solo ON_STATUS_CHANGED: estado destino ({{toStatusName}}). */
  toStatusName?: string;
  /** Solo ON_FIELD_UPDATED: etiquetas de los campos que cambiaron ({{updatedFields}}). */
  updatedFieldLabels?: string[];
}

/**
 * Servicio central de notificaciones. Hoy envia por WhatsApp; el envio por
 * correo esta preparado y documentado para activarse en el futuro (ver
 * {@link sendEmailNotification}).
 *
 * Toda notificacion es "best effort": un fallo al notificar nunca debe romper
 * la operacion de negocio que la origino (p.ej. asignar un responsable).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly whatsapp: WhatsappService,
    private readonly templates: MessageTemplatesService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Notifica a los usuarios recien asignados como responsables de una actividad.
   * Resuelve telefono/nombre de cada uno y renderiza el mensaje (el propio de la
   * regla si lo trae, o la plantilla RESPONSIBLE_ASSIGNED) interpolando las
   * variables de la actividad y del evento. Envia por el canal indicado.
   */
  async notifyResponsibleAssigned(
    ctx: ResponsibleAssignedContext,
  ): Promise<void> {
    if (ctx.responsibleUserIds.length === 0) return;

    const organization = await this.loadOrganization(
      ctx.activity.organizationId,
    );

    // Gate de notificaciones: si el SUPER_ADMIN las deshabilito para la
    // organizacion, no se envia nada (ni correo ni WhatsApp). Ausencia del flag
    // = habilitado, para no romper organizaciones preexistentes.
    if (organization?.enabledFeatures?.notificationsEnabled === false) {
      this.logger.debug(
        `Notificaciones deshabilitadas para la organizacion ${ctx.activity.organizationId}; asignacion de responsable omitida.`,
      );
      return;
    }

    const templateDoc = await this.templates.getByKey(
      ctx.activity.organizationId,
      NotificationTemplateKey.RESPONSIBLE_ASSIGNED,
    );
    const template =
      templateDoc?.body ??
      DEFAULT_TEMPLATES[NotificationTemplateKey.RESPONSIBLE_ASSIGNED];
    // Cuerpo a enviar: el mensaje propio de la regla (admite variables) si trae
    // texto; si no, la plantilla de la organizacion (o su texto por defecto).
    const bodyTemplate = ctx.messageOverride?.trim()
      ? ctx.messageOverride
      : template;
    // Canal de entrega: prioriza el canal forzado por quien dispara (regla
    // "Notificar a"); si no, el de la plantilla; y en su defecto, WhatsApp.
    const channel =
      ctx.channel ?? templateDoc?.channel ?? NotificationChannel.WHATSAPP;
    const frontendOrigin = this.config.get<string>('FRONTEND_ORIGIN');

    for (const userId of ctx.responsibleUserIds) {
      try {
        const user = await this.loadUser(userId);
        if (!user) continue;

        const vars = buildActivityVars(ctx.activity, ctx.project, {
          organizationName: organization?.name,
          frontendOrigin,
          responsibleName: user.name ?? '',
          fromStatusName: ctx.fromStatusName,
          toStatusName: ctx.toStatusName,
          updatedFieldLabels: ctx.updatedFieldLabels,
        });
        const body = interpolate(bodyTemplate, vars);
        // Asunto del correo: usa el de la plantilla (interpolado) si se definio;
        // si no, un asunto por defecto.
        const subjectTemplate = templateDoc?.subject?.trim();
        const subject = subjectTemplate
          ? interpolate(subjectTemplate, vars)
          : `Nueva asignación: ${ctx.activity.name}`;

        await this.deliver(channel, user, ctx.activity.organizationId, {
          subject,
          body,
        });
      } catch (err) {
        this.logger.error(
          `No se pudo notificar al responsable ${userId}: ${(err as Error).message}`,
        );
      }
    }
  }

  // ----------------------------------------------------------------------
  // Canales de envio
  // ----------------------------------------------------------------------

  /**
   * Entrega la notificacion por el medio configurado en la plantilla. WHATSAPP
   * (por defecto) y EMAIL son excluyentes; BOTH envia por ambos. Cada canal es
   * best effort: si uno no aplica (sin telefono o sin correo) simplemente se
   * omite.
   */
  private async deliver(
    channel: NotificationChannel,
    user: User,
    organizationId: string,
    mail: { subject: string; body: string },
  ): Promise<void> {
    const useWhatsApp =
      channel === NotificationChannel.WHATSAPP ||
      channel === NotificationChannel.BOTH;
    const useEmail =
      channel === NotificationChannel.EMAIL ||
      channel === NotificationChannel.BOTH;

    if (useWhatsApp) await this.sendWhatsApp(user, organizationId, mail.body);
    if (useEmail) await this.sendEmailNotification(user, mail);
  }

  /** Envia la notificacion por WhatsApp si el usuario tiene telefono. Queda
   * registrada como chat, para que sea visible en la ventana de Chats
   * WhatsApp. */
  private async sendWhatsApp(
    user: User,
    organizationId: string,
    body: string,
  ): Promise<void> {
    const phone = normalizePhoneForWhatsApp(user.phone);
    if (!phone) {
      this.logger.debug(
        `Usuario ${user.id} sin telefono; se omite notificacion por WhatsApp.`,
      );
      return;
    }
    await this.whatsapp.sendBotMessageToPhone(organizationId, phone, body);
  }

  /**
   * Envio de notificaciones por correo electronico via {@link EmailService}
   * (Amazon SES). Best effort: si el usuario no tiene correo o SES no esta
   * configurado, el envio se omite sin romper la operacion de negocio.
   *
   * @param user  Destinatario (se usa user.email).
   * @param mail  Asunto y cuerpo ya renderizados.
   */
  private async sendEmailNotification(
    user: User,
    mail: { subject: string; body: string },
  ): Promise<void> {
    if (!user.email) {
      this.logger.debug(
        `Usuario ${user.id} sin correo; se omite notificacion por email.`,
      );
      return;
    }
    await this.email.send({
      to: user.email,
      subject: mail.subject,
      body: mail.body,
    });
  }

  // ----------------------------------------------------------------------
  // Helpers de lectura
  // ----------------------------------------------------------------------

  private async loadUser(userId: string): Promise<User | null> {
    return docToEntity<User>(
      await this.firebase.firestore
        .collection(FirestoreCollections.USERS)
        .doc(userId)
        .get(),
    );
  }

  private async loadOrganization(
    organizationId: string,
  ): Promise<Organization | null> {
    return docToEntity<Organization>(
      await this.firebase.firestore
        .collection(FirestoreCollections.ORGANIZATIONS)
        .doc(organizationId)
        .get(),
    );
  }
}
