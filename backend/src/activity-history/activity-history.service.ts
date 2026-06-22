import { Injectable } from '@nestjs/common';
import {
  ActivityFieldChange,
  ActivityHistoryType,
  ActivityStatusHistory,
  FirestoreCollections,
  NotificationChannel,
  UserRole,
} from '@gen-task/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { snapshotToEntities } from '../firebase/firestore.helpers';

export interface RecordStatusChangeInput {
  activityId: string;
  organizationId: string;
  projectId: string;
  previousStatusId?: string;
  newStatusId: string;
  changedBy: string;
  changedByRole: UserRole;
  comment?: string;
}

export interface RecordFieldUpdateInput {
  activityId: string;
  organizationId: string;
  projectId: string;
  fieldChanges: ActivityFieldChange[];
  changedBy: string;
  changedByRole: UserRole;
  comment?: string;
}

export interface RecordNotificationInput {
  activityId: string;
  organizationId: string;
  projectId: string;
  changedBy: string;
  changedByRole: UserRole;
  /** Nombre de la regla que disparó la notificación. */
  ruleName: string;
  /** Canal usado (WhatsApp / Email / Ambos). */
  notificationChannel: NotificationChannel;
  /** Descripción legible del destinatario. */
  notificationRecipient?: string;
  /** IDs de usuarios notificados (cuando los destinatarios son internos). */
  notificationRecipientIds?: string[];
}

/**
 * Historial de actividades. Registra cambios de estado (STATUS_CHANGE) y
 * ediciones de campos personalizados (FIELD_UPDATE). La firma esta pensada para
 * extenderse a otros eventos (responsables, archivos) sin romper consumidores.
 */
@Injectable()
export class ActivityHistoryService {
  constructor(private readonly firebase: FirebaseService) {}

  private get collection() {
    return this.firebase.firestore.collection(
      FirestoreCollections.ACTIVITY_STATUS_HISTORY,
    );
  }

  async recordStatusChange(
    input: RecordStatusChangeInput,
  ): Promise<ActivityStatusHistory> {
    const ref = this.collection.doc();
    const data: Omit<ActivityStatusHistory, 'id'> = {
      activityId: input.activityId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      type: ActivityHistoryType.STATUS_CHANGE,
      previousStatusId: input.previousStatusId,
      newStatusId: input.newStatusId,
      changedBy: input.changedBy,
      changedByRole: input.changedByRole,
      comment: input.comment,
      createdAt: new Date().toISOString(),
    };
    await ref.set(data);
    return { id: ref.id, ...data };
  }

  async recordFieldUpdate(
    input: RecordFieldUpdateInput,
  ): Promise<ActivityStatusHistory> {
    const ref = this.collection.doc();
    const data: Omit<ActivityStatusHistory, 'id'> = {
      activityId: input.activityId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      type: ActivityHistoryType.FIELD_UPDATE,
      fieldChanges: input.fieldChanges,
      changedBy: input.changedBy,
      changedByRole: input.changedByRole,
      comment: input.comment,
      createdAt: new Date().toISOString(),
    };
    await ref.set(data);
    return { id: ref.id, ...data };
  }

  async recordNotification(
    input: RecordNotificationInput,
  ): Promise<ActivityStatusHistory> {
    const ref = this.collection.doc();
    const data: Omit<ActivityStatusHistory, 'id'> = {
      activityId: input.activityId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      type: ActivityHistoryType.NOTIFICATION_SENT,
      changedBy: input.changedBy,
      changedByRole: input.changedByRole,
      comment: `Notificación: ${input.ruleName}`,
      notificationChannel: input.notificationChannel,
      notificationRecipient: input.notificationRecipient,
      notificationRecipientIds: input.notificationRecipientIds,
      createdAt: new Date().toISOString(),
    };
    await ref.set(data);
    return { id: ref.id, ...data };
  }

  async listByActivity(activityId: string): Promise<ActivityStatusHistory[]> {
    // Solo filtro por igualdad (no requiere indice compuesto). El orden por
    // fecha se aplica en memoria para evitar depender de un indice de Firestore.
    const snap = await this.collection
      .where('activityId', '==', activityId)
      .get();
    const entries = snapshotToEntities<ActivityStatusHistory>(snap);
    return entries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
}
