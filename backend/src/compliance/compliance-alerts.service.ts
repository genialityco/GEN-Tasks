import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import {
  Activity,
  FirestoreCollections,
  Host,
  Organization,
  Project,
  StatusComplianceAlert,
  StatusType,
  User,
  WhatsappRecipientType,
} from '@gen-task/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { docToEntity, snapshotToEntities } from '../firebase/firestore.helpers';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { normalizePhoneForWhatsApp } from '../common/phone';

const MS_PER_DAY = 86_400_000;

/**
 * Cron de alertas de cumplimiento por estado (SLA). Cada hora recorre los
 * proyectos con semaforo habilitado y alertas por estado activas, y para cada
 * actividad abierta evalua si incumplio el plazo de algun estado: la actividad
 * deberia haber ALCANZADO (o superado) el estado objetivo dentro de
 * `daysFromCreation` dias desde su creacion. Si al llegar ese plazo aun no lo
 * alcanzo, envia un WhatsApp automatico (una sola vez por actividad y estado,
 * registrado en `activity.complianceAlertsSent`).
 *
 * Requiere un proceso de backend continuo (el cron vive en el proceso NestJS).
 */
@Injectable()
export class ComplianceAlertsService {
  private readonly logger = new Logger(ComplianceAlertsService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly whatsapp: WhatsappService,
    private readonly config: ConfigService,
  ) {}

  /** Ejecucion programada (cada hora). Best effort: nunca lanza. */
  @Cron(CronExpression.EVERY_HOUR)
  async runScheduledScan(): Promise<void> {
    try {
      await this.scan();
    } catch (err) {
      this.logger.error(
        `Fallo el barrido de alertas de cumplimiento: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Recorre los proyectos con alertas por estado activas y evalua sus
   * actividades. Expuesto (no privado) para poder dispararse manualmente en
   * pruebas. `now` permite fijar el "ahora" en pruebas.
   */
  async scan(now: Date = new Date()): Promise<void> {
    const snap = await this.firebase.firestore
      .collection(FirestoreCollections.PROJECTS)
      .where('isArchived', '==', false)
      .get();
    const projects = snapshotToEntities<Project>(snap).filter(
      (p) =>
        p.compliance?.enabled &&
        (p.compliance.statusAlerts ?? []).some((a) => a.enabled),
    );
    for (const project of projects) {
      try {
        await this.scanProject(project, now);
      } catch (err) {
        this.logger.error(
          `Fallo al evaluar alertas del proyecto ${project.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  /** Evalua todas las actividades abiertas de un proyecto contra sus alertas. */
  private async scanProject(project: Project, now: Date): Promise<void> {
    const alerts = (project.compliance?.statusAlerts ?? []).filter(
      (a) => a.enabled,
    );
    if (alerts.length === 0) return;

    // Gate de notificaciones: si la organizacion las tiene deshabilitadas, no se
    // envia ninguna alerta de cumplimiento. Ausencia del flag = habilitado.
    const organization = await this.loadOrganization(project.organizationId);
    if (organization?.enabledFeatures?.notificationsEnabled === false) {
      this.logger.debug(
        `Notificaciones deshabilitadas para la organizacion ${project.organizationId}; alertas del proyecto ${project.id} omitidas.`,
      );
      return;
    }

    const orderByStatusId = new Map(
      project.statuses.map((s) => [s.id, s.order]),
    );
    const closedStatusIds = new Set(
      project.statuses
        .filter((s) => s.type === StatusType.CLOSED)
        .map((s) => s.id),
    );

    const snap = await this.firebase.firestore
      .collection(FirestoreCollections.ACTIVITIES)
      .where('projectId', '==', project.id)
      .where('isArchived', '==', false)
      .get();
    const activities = snapshotToEntities<Activity>(snap);

    for (const activity of activities) {
      // Actividad en un estado cerrado: ya completo su flujo, no incumple SLA.
      if (closedStatusIds.has(activity.statusId)) continue;
      const currentOrder = orderByStatusId.get(activity.statusId) ?? -1;

      for (const alert of alerts) {
        const targetOrder = orderByStatusId.get(alert.statusId);
        // Estado objetivo inexistente (borrado): la alerta ya no aplica.
        if (targetOrder == null) continue;
        // La actividad ya alcanzo o supero el estado objetivo: cumplio.
        if (currentOrder >= targetOrder) continue;
        // Alerta ya enviada para este estado.
        if (activity.complianceAlertsSent?.[alert.statusId]) continue;
        // Aun dentro del plazo.
        const deadline = this.deadlineFor(activity, alert);
        if (!deadline || now < deadline) continue;

        await this.fireAlert(project, activity, alert, now);
      }
    }
  }

  /** Fecha limite para alcanzar el estado: `createdAt + daysFromCreation`. */
  private deadlineFor(
    activity: Activity,
    alert: StatusComplianceAlert,
  ): Date | null {
    const created = new Date(activity.createdAt);
    if (Number.isNaN(created.getTime())) return null;
    return new Date(created.getTime() + alert.daysFromCreation * MS_PER_DAY);
  }

  /**
   * Envia la alerta a los destinatarios resueltos y marca la actividad para no
   * reenviarla. Si no hay destinatarios con telefono valido, no marca (asi se
   * reintenta cuando, por ejemplo, se asigne un responsable).
   */
  private async fireAlert(
    project: Project,
    activity: Activity,
    alert: StatusComplianceAlert,
    now: Date,
  ): Promise<void> {
    const recipients = await this.resolveRecipients(alert, activity);
    if (recipients.length === 0) {
      this.logger.debug(
        `Alerta de estado ${alert.statusId} de la actividad ${activity.id} omitida: sin destinatario con telefono valido.`,
      );
      return;
    }

    const message = this.renderMessage(project, activity, alert);
    for (const r of recipients) {
      // Todos los destinatarios (contactos externos o personal interno)
      // quedan registrados como chat, para que el mensaje sea visible en la
      // ventana de Chats WhatsApp.
      await this.whatsapp.sendBotMessageToPhone(
        activity.organizationId,
        r.phone,
        message,
      );
    }

    await this.firebase.firestore
      .collection(FirestoreCollections.ACTIVITIES)
      .doc(activity.id)
      .update({ [`complianceAlertsSent.${alert.statusId}`]: now.toISOString() });

    this.logger.debug(
      `Alerta de cumplimiento enviada: actividad ${activity.id}, estado ${alert.statusId}, ${recipients.length} destinatario(s).`,
    );
  }

  /** Texto del mensaje con las variables de la alerta interpoladas. */
  private renderMessage(
    project: Project,
    activity: Activity,
    alert: StatusComplianceAlert,
  ): string {
    const statusName =
      project.statuses.find((s) => s.id === alert.statusId)?.name ?? '';
    const base = (this.config.get<string>('FRONTEND_ORIGIN') ?? '').replace(
      /\/$/,
      '',
    );
    const link =
      `${base}/organizations/${activity.organizationId}` +
      `/projects/${activity.projectId}/activities/${activity.id}`;
    const vars: Record<string, string> = {
      activityName: activity.name,
      statusName,
      projectName: project.name,
      daysFromCreation: String(alert.daysFromCreation),
      link,
    };
    return alert.message.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) =>
      vars[key] !== undefined ? vars[key] : `{{${key}}}`,
    );
  }

  /**
   * Resuelve los telefonos destinatarios de la alerta segun `recipientType`.
   * Devuelve telefonos normalizados y sin duplicados.
   */
  private async resolveRecipients(
    alert: StatusComplianceAlert,
    activity: Activity,
  ): Promise<{ phone: string }[]> {
    const out: { phone: string }[] = [];
    const add = (phone: string | null | undefined) => {
      const p = normalizePhoneForWhatsApp(phone);
      if (p) out.push({ phone: p });
    };

    switch (alert.recipientType) {
      case WhatsappRecipientType.HOST: {
        if (activity.hostId) add(await this.resolveHostPhone(activity));
        break;
      }
      case WhatsappRecipientType.PHONE:
        add(alert.recipientPhone);
        break;
      case WhatsappRecipientType.MEMBER: {
        const user = await this.loadUser(alert.recipientUserId);
        add(user?.phone ?? null);
        break;
      }
      case WhatsappRecipientType.RESPONSIBLES: {
        for (const userId of activity.responsibleIds ?? []) {
          const user = await this.loadUser(userId);
          add(user?.phone ?? null);
        }
        break;
      }
    }

    const seen = new Set<string>();
    return out.filter((r) => (seen.has(r.phone) ? false : seen.add(r.phone)));
  }

  private async resolveHostPhone(activity: Activity): Promise<string | null> {
    if (!activity.hostId) return null;
    const host = docToEntity<Host>(
      await this.firebase.firestore
        .collection(FirestoreCollections.HOSTS)
        .doc(activity.hostId)
        .get(),
    );
    return host?.phone ?? null;
  }

  private async loadUser(userId?: string): Promise<User | null> {
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
