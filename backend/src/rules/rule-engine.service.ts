import { Injectable, Logger } from '@nestjs/common';
import {
  Activity,
  CustomFieldType,
  FirestoreCollections,
  Host,
  Project,
  ProjectRule,
  RuleActionType,
  RuleEvent,
  UserRole,
} from '@gen-task/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { docToEntity } from '../firebase/firestore.helpers';
import { evaluateConditions } from '../common/rule-evaluation';
import { ActivityHistoryService } from '../activity-history/activity-history.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
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
    private readonly projects: ProjectsService,
    private readonly notifications: NotificationsService,
  ) {}

  private get activities() {
    return this.firebase.firestore.collection(FirestoreCollections.ACTIVITIES);
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
          comment:
            (payload.message as string) ?? `Trigger: ${rule.name}`,
        });
        return activity;

      case RuleActionType.ASSIGN_RESPONSIBLE: {
        const responsibleId = payload.responsibleId as string | undefined;
        if (!responsibleId) return activity;
        if (activity.responsibleIds.includes(responsibleId)) return activity;
        const responsibleIds = [...activity.responsibleIds, responsibleId];
        await this.activities.doc(activity.id).update({
          responsibleIds,
          updatedAt: new Date().toISOString(),
        });
        const next = { ...activity, responsibleIds };
        // Notifica al responsable recien asignado por la regla (best effort).
        await this.notifications.notifyResponsibleAssigned({
          activity: next,
          project,
          responsibleUserIds: [responsibleId],
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
        const message = payload.message as string | undefined;
        if (!message) return activity;
        const phone = await this.resolveActivityPhone(activity);
        if (!phone) {
          this.logger.debug('Accion WhatsApp sin telefono asociado; omitida.');
          return activity;
        }
        await this.whatsapp.sendBotMessageToPhone(
          activity.organizationId,
          phone,
          message,
        );
        return activity;
      }

      default:
        return activity;
    }
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
}
