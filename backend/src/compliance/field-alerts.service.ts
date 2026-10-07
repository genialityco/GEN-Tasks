import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import {
  Activity,
  ActivityFileAttachment,
  ActivityHistoryType,
  ActivityStatusHistory,
  ConditionOperator,
  FieldAlert,
  FieldAlertRecipientType,
  FieldAlertTrigger,
  FirestoreCollections,
  NotificationChannel,
  Organization,
  Project,
  SCHEDULED_DATE_FIELD_KEY,
  User,
  WhatsappTemplateName,
} from '@gen-task/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { docToEntity, snapshotToEntities } from '../firebase/firestore.helpers';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { EmailService } from '../notifications/email.service';
import { evaluateCondition } from '../common/rule-evaluation';
import { buildActivityVars, interpolate } from '../common/template-vars';
import { normalizePhoneForWhatsApp } from '../common/phone';

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
/** Colombia (America/Bogota) es UTC-5 todo el ano (sin horario de verano). */
const BOGOTA_OFFSET_MS = -5 * MS_PER_HOUR;
/** Hora local por defecto de envio de las alertas EVENT_DAY. */
const DEFAULT_SEND_AT_HOUR = 8;

/** Destinatario ya resuelto: telefono para WhatsApp o correo. */
type ResolvedRecipient =
  | { kind: 'whatsapp'; phone: string; name: string }
  | { kind: 'email'; email: string };

/**
 * Cron de alertas por campo pendiente (`Project.fieldAlerts`). Cada hora
 * recorre los proyectos con alertas activas y, para cada actividad abierta cuyo
 * campo requerido siga vacio, envia el recordatorio cuando llega su momento:
 *
 * - EVENT_DAY: el dia de la fecha del evento, desde `sendAtHour` (hora Colombia).
 * - AFTER_FIELD_FILLED: `delayDays` dias despues de llenarse el campo origen.
 *
 * Cada alerta se envia una sola vez por actividad (registrada en
 * `activity.fieldAlertsSent`). Best effort: un fallo nunca rompe el barrido.
 */
@Injectable()
export class FieldAlertsService {
  private readonly logger = new Logger(FieldAlertsService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly whatsapp: WhatsappService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  /** Ejecucion programada (cada hora). Best effort: nunca lanza. */
  @Cron(CronExpression.EVERY_HOUR)
  async runScheduledScan(): Promise<void> {
    try {
      await this.scan();
    } catch (err) {
      this.logger.error(
        `Fallo el barrido de alertas por campo: ${(err as Error).message}`,
      );
    }
  }

  /** Recorre los proyectos con alertas por campo activas. `now` para pruebas. */
  async scan(now: Date = new Date()): Promise<void> {
    const snap = await this.firebase.firestore
      .collection(FirestoreCollections.PROJECTS)
      .where('isArchived', '==', false)
      .get();
    const projects = snapshotToEntities<Project>(snap).filter((p) =>
      (p.fieldAlerts ?? []).some((a) => a.enabled),
    );
    for (const project of projects) {
      try {
        await this.scanProject(project, now);
      } catch (err) {
        this.logger.error(
          `Fallo al evaluar alertas por campo del proyecto ${project.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  private async scanProject(project: Project, now: Date): Promise<void> {
    const alerts = (project.fieldAlerts ?? []).filter((a) => a.enabled);
    if (alerts.length === 0) return;

    const organization = await this.loadOrganization(project.organizationId);
    if (organization?.enabledFeatures?.notificationsEnabled === false) return;

    const snap = await this.firebase.firestore
      .collection(FirestoreCollections.ACTIVITIES)
      .where('projectId', '==', project.id)
      .where('isArchived', '==', false)
      .get();
    const activities = snapshotToEntities<Activity>(snap);

    for (const activity of activities) {
      for (const alert of alerts) {
        try {
          // Todos los campos requeridos tienen valor: no hay nada pendiente.
          const missing = (alert.requiredFieldKeys ?? []).filter((key) =>
            this.isEmpty(activity, key),
          );
          if (missing.length === 0) continue;
          const sentKey = await this.dueSentKey(alert, activity, now);
          if (!sentKey || activity.fieldAlertsSent?.[sentKey]) continue;
          await this.fireAlert(project, organization, activity, alert, missing, sentKey, now);
        } catch (err) {
          this.logger.error(
            `Fallo la alerta ${alert.id} de la actividad ${activity.id}: ${(err as Error).message}`,
          );
        }
      }
    }
  }

  /**
   * Si la alerta ya debe enviarse para la actividad, devuelve la clave con que
   * se registra el envio en `fieldAlertsSent`; si aun no toca, `null`.
   */
  private async dueSentKey(
    alert: FieldAlert,
    activity: Activity,
    now: Date,
  ): Promise<string | null> {
    if (alert.trigger === FieldAlertTrigger.EVENT_DAY) {
      const eventDate = this.eventDate(activity, alert);
      if (!eventDate || eventDate !== toBogotaDateKey(now)) return null;
      const hour = new Date(now.getTime() + BOGOTA_OFFSET_MS).getUTCHours();
      if (hour < (alert.sendAtHour ?? DEFAULT_SEND_AT_HOUR)) return null;
      return `${alert.id}_${eventDate}`;
    }

    if (alert.trigger === FieldAlertTrigger.AFTER_FIELD_FILLED) {
      if (!alert.sourceFieldKey) return null;
      if (this.isEmpty(activity, alert.sourceFieldKey)) return null;
      const filledAt = await this.filledAt(activity, alert.sourceFieldKey);
      if (!filledAt) return null;
      const due = filledAt.getTime() + (alert.delayDays ?? 0) * MS_PER_DAY;
      return now.getTime() >= due ? alert.id : null;
    }

    return null;
  }

  /** Fecha del evento (aaaa-mm-dd, hora Colombia) segun `dateFieldKey`. */
  private eventDate(activity: Activity, alert: FieldAlert): string | null {
    const key = alert.dateFieldKey || SCHEDULED_DATE_FIELD_KEY;
    const raw =
      key === SCHEDULED_DATE_FIELD_KEY
        ? activity.scheduledDate
        : activity.customFieldValues?.[key];
    if (typeof raw !== 'string' || !raw) return null;
    // Los inputs de fecha guardan 'aaaa-mm-dd' (sin zona): se usa tal cual.
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : toBogotaDateKey(date);
  }

  /**
   * Momento en que se lleno un campo. Para adjuntos (FILE/IMAGE/VIDEO) es la
   * fecha de subida del primer archivo; para el resto, la primera edicion del
   * historial que le dio valor. Si no hay rastro, la ultima actualizacion.
   */
  private async filledAt(
    activity: Activity,
    fieldKey: string,
  ): Promise<Date | null> {
    const value = activity.customFieldValues?.[fieldKey];
    if (Array.isArray(value)) {
      const times = (value as ActivityFileAttachment[])
        .map((f) => new Date(f?.uploadedAt ?? '').getTime())
        .filter((t) => !Number.isNaN(t));
      if (times.length > 0) return new Date(Math.min(...times));
    }

    const snap = await this.firebase.firestore
      .collection(FirestoreCollections.ACTIVITY_STATUS_HISTORY)
      .where('activityId', '==', activity.id)
      .get();
    const times = snapshotToEntities<ActivityStatusHistory>(snap)
      .filter(
        (h) =>
          h.type === ActivityHistoryType.FIELD_UPDATE &&
          (h.fieldChanges ?? []).some(
            (c) =>
              c.fieldKey === fieldKey &&
              !evaluateCondition(
                { fieldKey, operator: ConditionOperator.IS_EMPTY },
                { customFieldValues: { [fieldKey]: c.newValue } },
              ),
          ),
      )
      .map((h) => new Date(h.createdAt).getTime())
      .filter((t) => !Number.isNaN(t));
    if (times.length > 0) return new Date(Math.min(...times));

    const updated = new Date(activity.updatedAt);
    return Number.isNaN(updated.getTime()) ? null : updated;
  }

  private isEmpty(activity: Activity, fieldKey: string): boolean {
    return evaluateCondition(
      { fieldKey, operator: ConditionOperator.IS_EMPTY },
      activity,
    );
  }

  /**
   * Envia la alerta y la marca como enviada. Si ningun destinatario es valido
   * no se marca, para reintentar cuando se corrija la configuracion.
   */
  private async fireAlert(
    project: Project,
    organization: Organization | null,
    activity: Activity,
    alert: FieldAlert,
    missingFieldKeys: string[],
    sentKey: string,
    now: Date,
  ): Promise<void> {
    const recipients = await this.resolveRecipients(alert, activity);
    if (recipients.length === 0) {
      this.logger.warn(
        `Alerta "${alert.name}" de la actividad ${activity.id} sin destinatarios validos.`,
      );
      return;
    }

    const vars = buildActivityVars(activity, project, {
      organizationName: organization?.name,
      frontendOrigin: this.config.get<string>('FRONTEND_ORIGIN'),
    });
    const eventDate = this.eventDate(activity, alert);
    if (eventDate) vars.eventDate = formatDateKey(eventDate);
    vars.missingFields = missingFieldKeys
      .map((key) => project.customFields.find((f) => f.key === key)?.label ?? key)
      .join(', ');
    const body = interpolate(alert.message, vars);
    const subject = alert.subject?.trim()
      ? interpolate(alert.subject, vars)
      : `${alert.name}: ${activity.name}`;

    for (const r of recipients) {
      try {
        if (r.kind === 'whatsapp') {
          // Plantilla aprobada: Meta descarta el texto libre fuera de la
          // ventana de 24 h (ver NotificationsService.sendWhatsApp).
          await this.whatsapp.sendTemplateMessageToPhone(
            activity.organizationId,
            r.phone,
            WhatsappTemplateName.NOTIFICACION_ACTIVIDAD_UTILIDAD,
            [r.name, body],
          );
        } else {
          await this.email.send({ to: r.email, subject, body });
        }
      } catch (err) {
        this.logger.error(
          `No se pudo enviar la alerta "${alert.name}" (${r.kind}): ${(err as Error).message}`,
        );
      }
    }

    await this.firebase.firestore
      .collection(FirestoreCollections.ACTIVITIES)
      .doc(activity.id)
      .update({ [`fieldAlertsSent.${sentKey}`]: now.toISOString() });

    this.logger.log(
      `Alerta "${alert.name}" enviada: actividad ${activity.id}, ${recipients.length} destinatario(s).`,
    );
  }

  /** Resuelve los destinatarios (sin duplicados) de la alerta. */
  private async resolveRecipients(
    alert: FieldAlert,
    activity: Activity,
  ): Promise<ResolvedRecipient[]> {
    const channel = alert.memberChannel ?? NotificationChannel.WHATSAPP;
    const out: ResolvedRecipient[] = [];
    const addPhone = (phone: string | null | undefined, name?: string) => {
      const p = normalizePhoneForWhatsApp(phone);
      if (p) out.push({ kind: 'whatsapp', phone: p, name: name?.trim() || 'equipo' });
    };
    const addEmail = (email: string | null | undefined) => {
      const e = email?.trim();
      if (e) out.push({ kind: 'email', email: e });
    };
    const addUser = (user: User | null) => {
      if (!user) return;
      if (channel !== NotificationChannel.EMAIL) addPhone(user.phone, user.name);
      if (channel !== NotificationChannel.WHATSAPP) addEmail(user.email);
    };

    for (const r of alert.recipients ?? []) {
      switch (r.type) {
        case FieldAlertRecipientType.EMAIL:
          addEmail(r.value);
          break;
        case FieldAlertRecipientType.PHONE:
          addPhone(r.value);
          break;
        case FieldAlertRecipientType.MEMBER:
          addUser(await this.loadUser(r.value));
          break;
        case FieldAlertRecipientType.RESPONSIBLES:
          for (const userId of activity.responsibleIds ?? []) {
            addUser(await this.loadUser(userId));
          }
          break;
      }
    }

    const seen = new Set<string>();
    return out.filter((r) => {
      const key = r.kind === 'whatsapp' ? `w:${r.phone}` : `e:${r.email.toLowerCase()}`;
      return seen.has(key) ? false : (seen.add(key), true);
    });
  }

  private async loadUser(userId?: string | null): Promise<User | null> {
    if (!userId) return null;
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

/** Fecha (aaaa-mm-dd) en hora Colombia de un instante. */
function toBogotaDateKey(date: Date): string {
  return new Date(date.getTime() + BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
}

/** 'aaaa-mm-dd' -> 'dd/mm/aaaa'. */
function formatDateKey(key: string): string {
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
}
