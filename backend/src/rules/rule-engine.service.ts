import { Injectable, Logger } from '@nestjs/common';
import {
  Activity,
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

export interface RuleContext {
  actorId: string;
  actorRole: UserRole;
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
  ): Promise<Activity> {
    const rules = (project.rules ?? []).filter(
      (r) => r.isActive && r.event === event,
    );
    let current = activity;

    for (const rule of rules) {
      const matches = evaluateConditions(
        rule.conditions,
        rule.logicalOperator,
        current,
      );
      if (!matches) continue;
      this.logger.debug(`Regla "${rule.name}" disparada (${event}).`);
      for (const action of rule.actions) {
        current = await this.executeAction(rule, action.type, action.payload, current, ctx);
      }
    }
    return current;
  }

  private async executeAction(
    rule: ProjectRule,
    type: RuleActionType,
    payload: Record<string, unknown>,
    activity: Activity,
    ctx: RuleContext,
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
        return { ...activity, responsibleIds };
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
