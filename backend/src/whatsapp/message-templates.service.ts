import { Injectable, NotFoundException } from '@nestjs/common';
import {
  FirestoreCollections,
  MessageTemplate,
  NotificationChannel,
} from '@gen-task/shared';
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

  /**
   * Busca la plantilla activa de una organizacion por su `key` logica (ej:
   * RESPONSIBLE_ASSIGNED). Devuelve null si no existe o esta inactiva, para que
   * el llamador use un cuerpo por defecto.
   */
  async getByKey(
    organizationId: string,
    key: string,
  ): Promise<MessageTemplate | null> {
    const snap = await this.collection
      .where('organizationId', '==', organizationId)
      .where('key', '==', key)
      .where('isActive', '==', true)
      .limit(1)
      .get();
    if (snap.empty) return null;
    return docToEntity<MessageTemplate>(snap.docs[0]);
  }

  async create(
    organizationId: string,
    input: {
      key: string;
      name: string;
      body: string;
      subject?: string;
      channel?: NotificationChannel;
    },
  ): Promise<MessageTemplate> {
    const now = new Date().toISOString();
    const ref = this.collection.doc();
    const data: Omit<MessageTemplate, 'id'> = {
      organizationId,
      key: input.key,
      name: input.name,
      body: input.body,
      subject: input.subject,
      channel: input.channel ?? NotificationChannel.WHATSAPP,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(data);
    return { id: ref.id, ...data };
  }

  async update(
    templateId: string,
    patch: Partial<
      Pick<MessageTemplate, 'name' | 'body' | 'subject' | 'channel' | 'isActive'>
    >,
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
