import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Activity,
  CustomFieldType,
  FirestoreCollections,
  Host,
  NotificationChannel,
  Organization,
  Project,
  ProjectRule,
  RuleActionType,
  RuleEvent,
  User,
  UserRole,
  WhatsappRecipientType,
} from '@gen-task/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { docToEntity } from '../firebase/firestore.helpers';
import { evaluateConditions } from '../common/rule-evaluation';
import {
  ActivityVarOptions,
  buildActivityVars,
  interpolate,
} from '../common/template-vars';
import { ActivityHistoryService } from '../activity-history/activity-history.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { WhatsappCloudApiService } from '../whatsapp/whatsapp-cloud-api.service';
import { ProjectsService } from '../projects/projects.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface RuleContext {
  actorId: string;
  actorRole: UserRole;
}

/** Transicion de estado que origino un evento ON_STATUS_CHANGED. */
export interface StatusTransition {
  fromStatusId?: string;
  toStatusId: string;
}

/**
 * Ejecuta las reglas (triggers) de un proyecto cuando ocurre un evento sobre
 * una actividad. Evalua las condiciones y, si se cumplen, aplica las acciones.
 *
 * Las acciones que mutan la actividad se aplican de forma directa (sin volver a
 * disparar el motor) para evitar recursion entre reglas.
 */
@Injectable()
export class RuleEngineService {
  private readonly logger = new Logger(RuleEngineService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly history: ActivityHistoryService,
    private readonly whatsapp: WhatsappService,
    private readonly cloudApi: WhatsappCloudApiService,
    private readonly projects: ProjectsService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  private get activities() {
    return this.firebase.firestore.collection(FirestoreCollections.ACTIVITIES);
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

  /**
   * Ejecuta todas las reglas activas del proyecto que coinciden con el evento.
   * Devuelve la actividad (posiblemente actualizada por las acciones).
   */
  async runForEvent(
    event: RuleEvent,
    project: Project,
    activity: Activity,
    ctx: RuleContext,
    transition?: StatusTransition,
    /**
     * Solo para ON_FIELD_UPDATED: claves de los campos que cambiaron en esta
     * actualizacion. Se usa para que una regla se dispare unicamente cuando
     * cambia alguno de los campos que observa (los de sus condiciones), y no
     * ante cualquier edicion de campos no relacionados.
     */
    changedFieldKeys?: string[],
  ): Promise<Activity> {
    // Gate de funcionalidad: si el SUPER_ADMIN no habilito "triggers" para la
    // organizacion, no se evalua ninguna regla (la actividad pasa sin cambios).
    const organization = await this.loadOrganization(activity.organizationId);
    if (organization?.enabledFeatures?.triggersEnabled === false) {
      this.logger.debug(
        `Triggers deshabilitados para la organizacion ${activity.organizationId}; reglas omitidas.`,
      );
      return activity;
    }

    // Variables comunes a todas las acciones de este evento, para interpolar los
    // mensajes de notificacion (actividad, estado, campos, y contexto del evento:
    // estado origen/destino o campos actualizados).
    const statusNameOf = (id?: string) =>
      id ? project.statuses.find((s) => s.id === id)?.name ?? '' : '';
    const varOpts: ActivityVarOptions = {
      organizationName: organization?.name,
      frontendOrigin: this.config.get<string>('FRONTEND_ORIGIN'),
      fromStatusName: transition ? statusNameOf(transition.fromStatusId) : undefined,
      toStatusName: transition ? statusNameOf(transition.toStatusId) : undefined,
      updatedFieldLabels: changedFieldKeys
        ? changedFieldKeys
            .map(
              (k) =>
                (project.customFields ?? []).find(
                  (f) => f.key === k && !f.isArchived,
                )?.label,
            )
            .filter((label): label is string => Boolean(label))
        : undefined,
    };

    const rules = (project.rules ?? []).filter(
      (r) => r.isActive && r.event === event,
    );
    let current = activity;

    for (const rule of rules) {
      // ON_STATUS_CHANGED: si la regla acota la transicion, debe coincidir.
      if (event === RuleEvent.ON_STATUS_CHANGED && !this.matchesTransition(rule, transition)) {
        continue;
      }
      // ON_FIELD_UPDATED: la regla solo se dispara si cambio alguno de los
      // campos que observa (evita re-disparos al editar campos no relacionados).
      if (
        event === RuleEvent.ON_FIELD_UPDATED &&
        !this.watchesAChangedField(rule, project, changedFieldKeys)
      ) {
        continue;
      }
      const matches = evaluateConditions(
        rule.conditions,
        rule.logicalOperator,
        current,
      );
      if (!matches) continue;
      this.logger.debug(`Regla "${rule.name}" disparada (${event}).`);
      for (const action of rule.actions) {
        current = await this.executeAction(
          rule,
          action.type,
          action.payload,
          current,
          ctx,
          project,
          varOpts,
          organization?.enabledFeatures?.notificationsEnabled !== false,
        );
      }
    }
    return current;
  }

  /**
   * Indica si una regla de cambio de estado aplica a la transicion ocurrida.
   * Una regla sin `fromStatusId`/`toStatusId` aplica a cualquier transicion; si
   * los define, deben coincidir con la transicion (origen/destino).
   */
  private matchesTransition(
    rule: ProjectRule,
    transition?: StatusTransition,
  ): boolean {
    if (!rule.fromStatusId && !rule.toStatusId) return true;
    if (!transition) return true;
    if (rule.fromStatusId && rule.fromStatusId !== transition.fromStatusId) {
      return false;
    }
    if (rule.toStatusId && rule.toStatusId !== transition.toStatusId) {
      return false;
    }
    return true;
  }

  /**
   * Decide si una regla ON_FIELD_UPDATED debe ejecutarse en esta actualizacion.
   *
   * La regla "observa" los campos personalizados referenciados en sus condiciones.
   * Solo se dispara si alguno de esos campos esta entre los que cambiaron, de modo
   * que editar un campo no relacionado no vuelve a ejecutar la accion.
   *
   * Casos borde:
   *  - Sin info de campos cambiados (`undefined`): se mantiene el comportamiento
   *    previo (no filtra) para no romper otros llamadores.
   *  - Regla sin condiciones sobre campos personalizados (p.ej. solo sobre el
   *    estado, o sin condiciones): no observa un campo concreto, por lo que se
   *    permite y queda a cargo de `evaluateConditions`.
   */
  private watchesAChangedField(
    rule: ProjectRule,
    project: Project,
    changedFieldKeys?: string[],
  ): boolean {
    if (!changedFieldKeys) return true;
    const customKeys = new Set(
      (project.customFields ?? [])
        .filter((f) => !f.isArchived)
        .map((f) => f.key),
    );
    const watched = (rule.conditions ?? [])
      .map((c) => c.fieldKey)
      .filter((k) => customKeys.has(k));
    if (watched.length === 0) return true;
    const changed = new Set(changedFieldKeys);
    return watched.some((k) => changed.has(k));
  }

  private async executeAction(
    rule: ProjectRule,
    type: RuleActionType,
    payload: Record<string, unknown>,
    activity: Activity,
    ctx: RuleContext,
    project: Project,
    varOpts: ActivityVarOptions,
    notificationsEnabled: boolean,
  ): Promise<Activity> {
    switch (type) {
      case RuleActionType.REGISTER_HISTORY_EVENT:
        await this.history.recordStatusChange({
          activityId: activity.id,
          organizationId: activity.organizationId,
          projectId: activity.projectId,
          previousStatusId: activity.statusId,
          newStatusId: activity.statusId,
          changedBy: ctx.actorId,
          changedByRole: ctx.actorRole,
          comment: payload.message
            ? interpolate(
                payload.message as string,
                buildActivityVars(activity, project, varOpts),
              )
            : `Trigger: ${rule.name}`,
        });
        return activity;

      case RuleActionType.ASSIGN_RESPONSIBLE: {
        // Admite uno o varios usuarios: `responsibleIds` (array, formato actual) o
        // `responsibleId` (string, reglas creadas antes de permitir varios).
        const requested = Array.isArray(payload.responsibleIds)
          ? (payload.responsibleIds as string[])
          : payload.responsibleId
            ? [payload.responsibleId as string]
            : [];
        // Solo los que aun no son responsables (sin duplicar).
        const toAdd = [...new Set(requested)].filter(
          (id) => id && !activity.responsibleIds.includes(id),
        );
        if (toAdd.length === 0) return activity;
        const responsibleIds = [...activity.responsibleIds, ...toAdd];
        await this.activities.doc(activity.id).update({
          responsibleIds,
          updatedAt: new Date().toISOString(),
        });
        const next = { ...activity, responsibleIds };
        // Notifica a los responsables recien asignados por la regla (best effort).
        // El canal lo elige la regla (WhatsApp / Correo / Ambos); si no se
        // configuro, `notifyResponsibleAssigned` cae a la plantilla / WhatsApp.
        // El mensaje propio de la regla (con variables) reemplaza a la plantilla
        // si se escribio; las variables del evento permiten textos dinamicos.
        await this.notifications.notifyResponsibleAssigned({
          activity: next,
          project,
          responsibleUserIds: toAdd,
          channel: payload.notificationChannel as NotificationChannel | undefined,
          messageOverride:
            typeof payload.message === 'string' ? payload.message : undefined,
          fromStatusName: varOpts.fromStatusName,
          toStatusName: varOpts.toStatusName,
          updatedFieldLabels: varOpts.updatedFieldLabels,
        });
        await this.history.recordNotification({
          activityId: activity.id,
          organizationId: activity.organizationId,
          projectId: activity.projectId,
          changedBy: ctx.actorId,
          changedByRole: ctx.actorRole,
          ruleName: rule.name,
          notificationChannel:
            (payload.notificationChannel as NotificationChannel) ??
            NotificationChannel.WHATSAPP,
          notificationRecipientIds: toAdd,
        });
        return next;
      }

      case RuleActionType.CHANGE_STATUS: {
        const statusId = payload.statusId as string | undefined;
        if (!statusId || statusId === activity.statusId) return activity;
        await this.activities.doc(activity.id).update({
          statusId,
          updatedAt: new Date().toISOString(),
        });
        await this.history.recordStatusChange({
          activityId: activity.id,
          organizationId: activity.organizationId,
          projectId: activity.projectId,
          previousStatusId: activity.statusId,
          newStatusId: statusId,
          changedBy: ctx.actorId,
          changedByRole: ctx.actorRole,
          comment: `Trigger: ${rule.name}`,
        });
        return { ...activity, statusId };
      }

      case RuleActionType.CREATE_CUSTOM_FIELD: {
        // Soporta uno o varios campos por accion: `payload.fields[]` (formato
        // nuevo) o el formato antiguo de un solo campo (label/type/...).
        const defs: Record<string, unknown>[] = Array.isArray(payload.fields)
          ? (payload.fields as Record<string, unknown>[])
          : [payload];
        for (const def of defs) {
          const label = (def.label as string | undefined)?.trim();
          const type = def.type as CustomFieldType | undefined;
          if (!label || !type) continue;
          try {
            const created = await this.projects.createCustomFieldFromRule(
              activity.projectId,
              {
                label,
                type,
                required: Boolean(def.required),
                options: Array.isArray(def.options)
                  ? (def.options as { label: string; value: string }[])
                  : undefined,
                // El campo solo sera visible/exigible en actividades que cumplan
                // la misma condicion que disparo la regla.
                visibilityConditions: rule.conditions,
                visibilityLogicalOperator: rule.logicalOperator,
              },
            );
            if (created) {
              this.logger.debug(
                `Campo personalizado "${created.label}" creado por la regla "${rule.name}".`,
              );
            }
          } catch (err) {
            this.logger.warn(
              `No se pudo crear el campo personalizado "${label}" por la regla "${rule.name}": ${(err as Error).message}`,
            );
          }
        }
        return activity;
      }

      case RuleActionType.SEND_WHATSAPP:
      case RuleActionType.REQUEST_HOST_INFORMATION: {
        // Gate de notificaciones: si la organizacion las deshabilito, no se
        // envia el WhatsApp de la regla.
        if (!notificationsEnabled) {
          this.logger.debug(
            `Notificaciones deshabilitadas para la organizacion ${activity.organizationId}; accion WhatsApp de la regla "${rule.name}" omitida.`,
          );
          return activity;
        }
        const rawMessage = payload.message as string | undefined;
        if (!rawMessage) {
          this.logger.debug(
            `Accion WhatsApp de la regla "${rule.name}" sin mensaje; omitida.`,
          );
          return activity;
        }
        // Reemplaza las variables de la actividad/evento ({{activityName}},
        // {{statusName}}, {{toStatusName}}, {{updatedFields}}, campos, etc.).
        const message = interpolate(
          rawMessage,
          buildActivityVars(activity, project, varOpts),
        );
        const recipients = await this.resolveRecipients(payload, activity);
        if (recipients.length === 0) {
          this.logger.debug(
            `Accion WhatsApp de la regla "${rule.name}" omitida: ningun destinatario con telefono valido.`,
          );
          return activity;
        }
        for (const r of recipients) {
          // A los contactos externos (host / telefono fijo) se les abre/usa un
          // chat para dejar registro; al personal interno (miembro / responsables)
          // se les envia directo, sin crear un chat de host.
          if (r.persistChat) {
            await this.whatsapp.sendBotMessageToPhone(
              activity.organizationId,
              r.phone,
              message,
            );
          } else {
            await this.cloudApi.sendText({ to: r.phone, body: message });
          }
        }
        await this.history.recordNotification({
          activityId: activity.id,
          organizationId: activity.organizationId,
          projectId: activity.projectId,
          changedBy: ctx.actorId,
          changedByRole: ctx.actorRole,
          ruleName: rule.name,
          notificationChannel: NotificationChannel.WHATSAPP,
          notificationRecipient: this.resolveRecipientLabel(payload),
          notificationRecipientIds:
            (payload.recipientType as WhatsappRecipientType) ===
            WhatsappRecipientType.MEMBER
              ? [payload.recipientUserId as string].filter(Boolean)
              : undefined,
        });
        return activity;
      }

      default:
        return activity;
    }
  }

  /**
   * Resuelve los telefonos destinatarios de una accion de WhatsApp segun
   * `payload.recipientType`. Si no se especifica, por compatibilidad se usa el
   * host de la actividad. Devuelve telefonos normalizados y sin duplicados.
   */
  private async resolveRecipients(
    payload: Record<string, unknown>,
    activity: Activity,
  ): Promise<{ phone: string; persistChat: boolean }[]> {
    const type =
      (payload.recipientType as WhatsappRecipientType | undefined) ??
      WhatsappRecipientType.HOST;

    this.logger.debug(`Resolviendo destinatarios WhatsApp (tipo=${type}).`);

    const out: { phone: string; persistChat: boolean }[] = [];
    const add = (
      phone: string | null | undefined,
      persistChat: boolean,
      who: string,
    ) => {
      const p = normalizePhone(phone);
      if (p) {
        out.push({ phone: p, persistChat });
      } else {
        this.logger.debug(
          `  ${who}: telefono ausente o invalido (valor=${JSON.stringify(phone)}); descartado.`,
        );
      }
    };

    switch (type) {
      case WhatsappRecipientType.HOST: {
        if (!activity.hostId) {
          this.logger.debug('  HOST: la actividad no tiene hostId.');
          break;
        }
        add(await this.resolveActivityPhone(activity), true, `host ${activity.hostId}`);
        break;
      }

      case WhatsappRecipientType.PHONE:
        add(payload.recipientPhone as string | undefined, true, 'telefono fijo del payload');
        break;

      case WhatsappRecipientType.MEMBER: {
        const userId = payload.recipientUserId as string | undefined;
        if (!userId) {
          this.logger.debug('  MEMBER: la regla no tiene recipientUserId configurado.');
          break;
        }
        const user = await this.loadUser(userId);
        if (!user) {
          this.logger.debug(`  MEMBER: usuario ${userId} no encontrado.`);
          break;
        }
        add(user.phone ?? null, false, `miembro ${userId}`);
        break;
      }

      case WhatsappRecipientType.RESPONSIBLES: {
        const ids = activity.responsibleIds ?? [];
        if (ids.length === 0) {
          this.logger.debug('  RESPONSIBLES: la actividad no tiene responsibleIds.');
          break;
        }
        for (const userId of ids) {
          const user = await this.loadUser(userId);
          if (!user) {
            this.logger.debug(`  RESPONSIBLES: usuario ${userId} no encontrado.`);
            continue;
          }
          add(user.phone ?? null, false, `responsable ${userId}`);
        }
        break;
      }
    }

    // Dedupe por telefono (un mismo numero no recibe el mensaje dos veces).
    const seen = new Set<string>();
    return out.filter((r) => (seen.has(r.phone) ? false : seen.add(r.phone)));
  }

  /** Resuelve el telefono del host asociado a la actividad (si lo hay). */
  private async resolveActivityPhone(
    activity: Activity,
  ): Promise<string | null> {
    if (!activity.hostId) return null;
    const host = docToEntity<Host>(
      await this.firebase.firestore
        .collection(FirestoreCollections.HOSTS)
        .doc(activity.hostId)
        .get(),
    );
    return host?.phone ?? null;
  }

  /** Etiqueta legible del destinatario de una accion WhatsApp (para el historial). */
  private resolveRecipientLabel(payload: Record<string, unknown>): string {
    const type =
      (payload.recipientType as WhatsappRecipientType | undefined) ??
      WhatsappRecipientType.HOST;
    switch (type) {
      case WhatsappRecipientType.HOST:
        return 'Host de la actividad';
      case WhatsappRecipientType.RESPONSIBLES:
        return 'Responsables de la actividad';
      case WhatsappRecipientType.PHONE:
        return `Teléfono: ${payload.recipientPhone ?? '—'}`;
      case WhatsappRecipientType.MEMBER:
        return 'Miembro de la organización';
      default:
        return '—';
    }
  }

  /** Carga un usuario por id (null si no existe o no se proporciona id). */
  private async loadUser(userId?: string): Promise<User | null> {
    if (!userId) return null;
    return docToEntity<User>(
      await this.firebase.firestore
        .collection(FirestoreCollections.USERS)
        .doc(userId)
        .get(),
    );
  }
}

/**
 * Normaliza un telefono al formato del WhatsApp Cloud API (solo digitos, con
 * codigo de pais). Antepone 57 a celulares colombianos de 10 digitos que
 * empiezan por 3. Devuelve null si no hay telefono utilizable.
 */
function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
  return digits;
}
