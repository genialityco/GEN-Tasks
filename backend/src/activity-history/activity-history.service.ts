import { Injectable } from '@nestjs/common';
import {
  ActivityStatusHistory,
  FirestoreCollections,
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

/**
 * Historial de actividades. En la primera version registra cambios de estado.
 * La firma esta pensada para extenderse a otros eventos (campos, responsables,
 * archivos) en el futuro sin romper a los consumidores.
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

  async listByActivity(activityId: string): Promise<ActivityStatusHistory[]> {
    const snap = await this.collection
      .where('activityId', '==', activityId)
      .orderBy('createdAt', 'desc')
      .get();
    return snapshotToEntities<ActivityStatusHistory>(snap);
  }
}
