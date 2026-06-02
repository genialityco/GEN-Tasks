import { Injectable, NotFoundException } from '@nestjs/common';
import { FirestoreCollections, MessageTemplate } from '@gen-task/shared';
import { FirebaseService } from '../firebase/firebase.service';
import {
  docToEntity,
  snapshotToEntities,
} from '../firebase/firestore.helpers';

@Injectable()
export class MessageTemplatesService {
  constructor(private readonly firebase: FirebaseService) {}

  private get collection() {
    return this.firebase.firestore.collection(
      FirestoreCollections.MESSAGE_TEMPLATES,
    );
  }

  listByOrganization(organizationId: string): Promise<MessageTemplate[]> {
    return this.collection
      .where('organizationId', '==', organizationId)
      .get()
      .then((snap) => snapshotToEntities<MessageTemplate>(snap));
  }

  async create(
    organizationId: string,
    input: { key: string; name: string; body: string },
  ): Promise<MessageTemplate> {
    const now = new Date().toISOString();
    const ref = this.collection.doc();
    const data: Omit<MessageTemplate, 'id'> = {
      organizationId,
      key: input.key,
      name: input.name,
      body: input.body,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(data);
    return { id: ref.id, ...data };
  }

  async update(
    templateId: string,
    patch: Partial<Pick<MessageTemplate, 'name' | 'body' | 'isActive'>>,
  ): Promise<MessageTemplate> {
    const ref = this.collection.doc(templateId);
    if (!(await ref.get()).exists) {
      throw new NotFoundException('Plantilla no encontrada.');
    }
    await ref.update({ ...patch, updatedAt: new Date().toISOString() });
    return docToEntity<MessageTemplate>(await ref.get())!;
  }

  async remove(templateId: string): Promise<void> {
    await this.collection.doc(templateId).delete();
  }
}
