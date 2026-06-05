import { Injectable, Logger } from '@nestjs/common';
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
import { WhatsappCloudApiService } from '../whatsapp/whatsapp-cloud-api.service';
import { MessageTemplatesService } from '../whatsapp/message-templates.service';

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
    'Estado actual: {{statusName}}.',
};

/** Contexto para renderizar la notificacion de asignacion de responsable. */
interface ResponsibleAssignedContext {
  activity: Activity;
  project: Project;
  /** Ids de usuarios recien asignados (no toda la lista de responsables). */
  responsibleUserIds: string[];
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
    private readonly cloudApi: WhatsappCloudApiService,
    private readonly templates: MessageTemplatesService,
  ) {}

  /**
   * Notifica a los usuarios recien asignados como responsables de una actividad.
   * Resuelve telefono y nombre de cada uno, renderiza la plantilla
   * RESPONSIBLE_ASSIGNED y envia por WhatsApp (y, en el futuro, por correo).
   */
  async notifyResponsibleAssigned(
    ctx: ResponsibleAssignedContext,
  ): Promise<void> {
    if (ctx.responsibleUserIds.length === 0) return;

    const organization = await this.loadOrganization(
      ctx.activity.organizationId,
    );
    const statusName =
      ctx.project.statuses.find((s) => s.id === ctx.activity.statusId)?.name ??
      '';

    const templateDoc = await this.templates.getByKey(
      ctx.activity.organizationId,
      NotificationTemplateKey.RESPONSIBLE_ASSIGNED,
    );
    const template =
      templateDoc?.body ??
      DEFAULT_TEMPLATES[NotificationTemplateKey.RESPONSIBLE_ASSIGNED];
    // Canal de entrega: lo define la plantilla; si no esta configurado se usa
    // WhatsApp por defecto.
    const channel = templateDoc?.channel ?? NotificationChannel.WHATSAPP;

    for (const userId of ctx.responsibleUserIds) {
      try {
        const user = await this.loadUser(userId);
        if (!user) continue;

        const vars: Record<string, string> = {
          responsibleName: user.name ?? '',
          activityName: ctx.activity.name,
          statusName,
          projectName: ctx.project.name,
          organizationName: organization?.name ?? '',
        };
        const body = interpolate(template, vars);

        await this.deliver(channel, user, {
          subject: `Nueva asignación: ${ctx.activity.name}`,
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
    mail: { subject: string; body: string },
  ): Promise<void> {
    const useWhatsApp =
      channel === NotificationChannel.WHATSAPP ||
      channel === NotificationChannel.BOTH;
    const useEmail =
      channel === NotificationChannel.EMAIL ||
      channel === NotificationChannel.BOTH;

    if (useWhatsApp) await this.sendWhatsApp(user, mail.body);
    if (useEmail) await this.sendEmailNotification(user, mail);
  }

  /** Envia la notificacion por WhatsApp si el usuario tiene telefono. */
  private async sendWhatsApp(user: User, body: string): Promise<void> {
    const phone = normalizePhoneForWhatsApp(user.phone);
    if (!phone) {
      this.logger.debug(
        `Usuario ${user.id} sin telefono; se omite notificacion por WhatsApp.`,
      );
      return;
    }
    await this.cloudApi.sendText({ to: phone, body });
  }

  /**
   * Envio de notificaciones por correo electronico.
   *
   * PENDIENTE DE INTEGRACION: cuando se contrate/integre un proveedor de correo
   * (p.ej. SendGrid, Amazon SES, Resend o SMTP), implementar aqui el envio real.
   * Se deja la firma y el punto de llamada listos para que activarlo no requiera
   * tocar la logica de negocio (activities/rules ya invocan este flujo).
   *
   * Pasos sugeridos para la integracion:
   *  1. Anadir las credenciales del proveedor a variables de entorno
   *     (p.ej. MAIL_PROVIDER, MAIL_API_KEY, MAIL_FROM).
   *  2. Inyectar un cliente de correo en este servicio (o un EmailService propio).
   *  3. Reemplazar el log de abajo por la llamada real al proveedor.
   *  4. Respetar el caracter "best effort": capturar errores sin propagarlos.
   *
   * @param user  Destinatario (se usa user.email).
   * @param mail  Asunto y cuerpo ya renderizados.
   */
  private async sendEmailNotification(
    user: User,
    mail: { subject: string; body: string },
  ): Promise<void> {
    if (!user.email) return;
    // TODO(email): integrar proveedor de correo y enviar `mail` a `user.email`.
    this.logger.debug(
      `[email pendiente] Para: ${user.email} | Asunto: ${mail.subject}`,
    );
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

/** Reemplaza los placeholders `{{clave}}` de una plantilla por sus valores. */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) =>
    vars[key] !== undefined ? vars[key] : `{{${key}}}`,
  );
}

/**
 * Normaliza un telefono al formato que exige el WhatsApp Cloud API (solo
 * digitos, con codigo de pais). Para numeros colombianos de 10 digitos que
 * empiezan por 3 (celular) antepone el indicativo 57. Devuelve null si no hay
 * telefono utilizable.
 */
function normalizePhoneForWhatsApp(phone?: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
  return digits;
}
