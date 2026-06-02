import { Injectable } from '@nestjs/common';
import { FirestoreCollections, Host } from '@gen-task/shared';
import { FirebaseService } from '../firebase/firebase.service';
import {
  docToEntity,
  snapshotToEntities,
} from '../firebase/firestore.helpers';

@Injectable()
export class HostsService {
  constructor(private readonly firebase: FirebaseService) {}

  private get collection() {
    return this.firebase.firestore.collection(FirestoreCollections.HOSTS);
  }

  listByOrganization(organizationId: string): Promise<Host[]> {
    return this.collection
      .where('organizationId', '==', organizationId)
      .get()
      .then((snap) => snapshotToEntities<Host>(snap));
  }

  /**
   * Crea o actualiza un Host por (organizationId, phone). El Host se identifica
   * unicamente por su numero de WhatsApp dentro de la organizacion.
   */
  async findOrCreate(
    organizationId: string,
    phone: string,
    name?: string,
  ): Promise<Host> {
    const existing = await this.collection
      .where('organizationId', '==', organizationId)
      .where('phone', '==', phone)
      .limit(1)
      .get();

    const now = new Date().toISOString();

    if (!existing.empty) {
      const ref = existing.docs[0].ref;
      if (name) await ref.update({ name, updatedAt: now });
      return docToEntity<Host>(await ref.get())!;
    }

    const ref = this.collection.doc();
    const data: Omit<Host, 'id'> = {
      organizationId,
      phone,
      name,
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(data);
    return { id: ref.id, ...data };
  }
}
