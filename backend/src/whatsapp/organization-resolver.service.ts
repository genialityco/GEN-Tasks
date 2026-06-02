import { Injectable } from '@nestjs/common';
import { FirestoreCollections, Host } from '@gen-task/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { snapshotToEntities } from '../firebase/firestore.helpers';

/**
 * Resuelve a que organizacion pertenece un mensaje entrante de WhatsApp.
 *
 * La estrategia esta encapsulada aqui para soportar, sin reescribir el flujo,
 * los escenarios previstos:
 *  1. Organizacion por configuracion (un numero global -> una organizacion).
 *  2. Seleccion de organizacion dentro del flujo del bot.
 *  3. Relacion previa entre numero del Host y organizacion.
 *  4. Numeros de WhatsApp separados por organizacion (futuro).
 */
@Injectable()
export class OrganizationResolverService {
  constructor(private readonly firebase: FirebaseService) {}

  /**
   * Intenta resolver el organizationId. Devuelve null si se requiere que el
   * Host seleccione organizacion (el bot debe entonces preguntar).
   */
  async resolve(params: {
    phone: string;
    inboundPhoneNumberId?: string;
  }): Promise<string | null> {
    // Estrategia 4 (futuro): match por phoneNumberId entrante.
    if (params.inboundPhoneNumberId) {
      const byNumber = await this.firebase.firestore
        .collection(FirestoreCollections.ORGANIZATIONS)
        .where('whatsappConfig.phoneNumberId', '==', params.inboundPhoneNumberId)
        .where('isArchived', '==', false)
        .limit(1)
        .get();
      if (!byNumber.empty) return byNumber.docs[0].id;
    }

    // Estrategia 3: el numero ya esta asociado a un unico Host/organizacion.
    const hostsSnap = await this.firebase.firestore
      .collection(FirestoreCollections.HOSTS)
      .where('phone', '==', params.phone)
      .get();
    const hosts = snapshotToEntities<Host>(hostsSnap);
    const orgIds = [...new Set(hosts.map((h) => h.organizationId))];
    if (orgIds.length === 1) return orgIds[0];

    // Estrategia 1: organizacion unica configurada con WhatsApp habilitado.
    const orgsSnap = await this.firebase.firestore
      .collection(FirestoreCollections.ORGANIZATIONS)
      .where('whatsappConfig.enabled', '==', true)
      .where('isArchived', '==', false)
      .get();
    if (orgsSnap.size === 1) return orgsSnap.docs[0].id;

    // Ningun criterio resolvio: el bot debe pedir seleccion (estrategia 2).
    return null;
  }
}
