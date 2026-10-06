import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { firestore } from 'firebase-admin';
import {
  FirestoreCollections,
  WhatsappGroup,
  WhatsappGroupJoinApprovalMode,
} from '@gen-task/shared';
import { FirebaseService } from '../firebase/firebase.service';
import {
  docToEntity,
  snapshotToEntities,
} from '../firebase/firestore.helpers';
import { WhatsappCloudApiService } from './whatsapp-cloud-api.service';

/** Evento de grupo normalizado desde el webhook (`value.groups[]`). */
export interface GroupWebhookEvent {
  /** Campo del cambio: group_lifecycle_update, group_participants_update, ... */
  field: string;
  type?: string;
  group_id?: string;
  request_id?: string;
  subject?: string;
  description?: string;
  invite_link?: string;
  join_approval_mode?: WhatsappGroupJoinApprovalMode;
  added_participants?: { wa_id: string }[];
  removed_participants?: { wa_id: string }[];
  errors?: {
    code?: number | string;
    message?: string;
    title?: string;
    error_data?: { details?: string };
  }[];
}

/**
 * Esperas (ms) antes de reintentar ubicar el grupo por `request_id` cuando el
 * webhook de creacion llega antes de que se haya guardado el documento.
 */
const LIFECYCLE_RETRY_DELAYS_MS = [1000, 3000];

/**
 * Grupos de WhatsApp (Groups API de Meta). La creacion es asincrona: se guarda
 * el grupo como PENDING con el `request_id` y el webhook
 * `group_lifecycle_update` lo completa con `group_id` + `invite_link`.
 * Los participantes solo pueden entrar por el enlace de invitacion.
 */
@Injectable()
export class WhatsappGroupsService {
  private readonly logger = new Logger(WhatsappGroupsService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly cloudApi: WhatsappCloudApiService,
  ) {}

  private get collection() {
    return this.firebase.firestore.collection(
      FirestoreCollections.WHATSAPP_GROUPS,
    );
  }

  async listByOrganization(organizationId: string): Promise<WhatsappGroup[]> {
    const snap = await this.collection
      .where('organizationId', '==', organizationId)
      .get();
    return snapshotToEntities<WhatsappGroup>(snap)
      .filter((g) => g.status !== 'DELETED')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async create(
    organizationId: string,
    input: {
      subject: string;
      description?: string;
      joinApprovalMode?: WhatsappGroupJoinApprovalMode;
    },
    createdBy?: string,
  ): Promise<WhatsappGroup> {
    const joinApprovalMode = input.joinApprovalMode ?? 'auto_approve';
    let requestId: string;
    try {
      ({ requestId } = await this.cloudApi.createGroup({
        subject: input.subject.trim(),
        description: input.description?.trim(),
        joinApprovalMode,
      }));
    } catch (err) {
      throw new BadGatewayException(
        `No se pudo crear el grupo en WhatsApp: ${(err as Error).message}`,
      );
    }

    const now = new Date().toISOString();
    const ref = this.collection.doc();
    const group: Omit<WhatsappGroup, 'id'> = {
      organizationId,
      requestId,
      subject: input.subject.trim(),
      ...(input.description?.trim()
        ? { description: input.description.trim() }
        : {}),
      joinApprovalMode,
      status: 'PENDING',
      participants: [],
      ...(createdBy ? { createdBy } : {}),
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(group);
    return { id: ref.id, ...group };
  }

  /** Genera un nuevo enlace de invitacion (el anterior deja de funcionar). */
  async resetInviteLink(
    organizationId: string,
    id: string,
  ): Promise<WhatsappGroup> {
    const group = await this.getActive(organizationId, id);
    const inviteLink = await this.callMeta(() =>
      this.cloudApi.resetGroupInviteLink(group.groupId!),
    );
    return this.patch(id, { inviteLink });
  }

  async sendMessage(
    organizationId: string,
    id: string,
    body: string,
  ): Promise<{ sent: true }> {
    const group = await this.getActive(organizationId, id);
    await this.callMeta(() => this.cloudApi.sendGroupText(group.groupId!, body));
    return { sent: true };
  }

  /**
   * Elimina el grupo en Meta. El documento se marca DELETED de inmediato; el
   * webhook `group_delete` posterior es idempotente.
   */
  async remove(organizationId: string, id: string): Promise<void> {
    const group = await this.getOwned(organizationId, id);
    if (group.groupId && group.status === 'ACTIVE') {
      await this.callMeta(() => this.cloudApi.deleteGroup(group.groupId!));
    }
    await this.patch(id, { status: 'DELETED' });
  }

  // ----------------------------------------------------------------------
  // Webhooks
  // ----------------------------------------------------------------------

  async handleWebhookEvent(event: GroupWebhookEvent): Promise<void> {
    try {
      if (event.field === 'group_lifecycle_update') {
        await this.handleLifecycle(event);
      } else if (event.field === 'group_participants_update') {
        await this.handleParticipants(event);
      } else {
        this.logger.log(
          `Webhook de grupo ${event.field}/${event.type} (${event.group_id}) sin manejar.`,
        );
      }
    } catch (err) {
      // Meta reintenta si no respondemos 200; un error aqui no debe tumbar el webhook.
      this.logger.error(
        `Error procesando webhook de grupo ${event.field}: ${(err as Error).message}`,
      );
    }
  }

  private async handleLifecycle(event: GroupWebhookEvent): Promise<void> {
    if (event.type === 'group_delete') {
      const doc = await this.findByGroupId(event.group_id);
      if (doc) await this.patch(doc.id, { status: 'DELETED' });
      return;
    }
    if (event.type !== 'group_create') return;

    const doc = await this.findByRequestIdWithRetry(event.request_id);
    if (!doc) {
      this.logger.warn(
        `group_create con request_id ${event.request_id} sin grupo asociado (group_id ${event.group_id}).`,
      );
      return;
    }

    if (event.errors?.length) {
      const e = event.errors[0];
      await this.patch(doc.id, {
        status: 'FAILED',
        error: e.error_data?.details ?? e.message ?? e.title ?? 'Error desconocido',
        ...(event.group_id ? { groupId: event.group_id } : {}),
      });
      return;
    }

    let inviteLink = event.invite_link;
    if (!inviteLink && event.group_id) {
      inviteLink = await this.cloudApi
        .getGroupInviteLink(event.group_id)
        .catch(() => undefined);
    }
    await this.patch(doc.id, {
      status: 'ACTIVE',
      groupId: event.group_id,
      ...(inviteLink ? { inviteLink } : {}),
      ...(event.join_approval_mode
        ? { joinApprovalMode: event.join_approval_mode }
        : {}),
    });
  }

  private async handleParticipants(event: GroupWebhookEvent): Promise<void> {
    const added = event.added_participants?.map((p) => p.wa_id) ?? [];
    const removed = event.removed_participants?.map((p) => p.wa_id) ?? [];
    if (!added.length && !removed.length) return;

    const doc = await this.findByGroupId(event.group_id);
    if (!doc) return;
    const ref = this.collection.doc(doc.id);
    const updatedAt = new Date().toISOString();
    if (added.length) {
      await ref.update({
        participants: firestore.FieldValue.arrayUnion(...added),
        updatedAt,
      });
    }
    if (removed.length) {
      await ref.update({
        participants: firestore.FieldValue.arrayRemove(...removed),
        updatedAt,
      });
    }
  }

  // ----------------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------------

  private async getOwned(
    organizationId: string,
    id: string,
  ): Promise<WhatsappGroup> {
    const group = docToEntity<WhatsappGroup>(await this.collection.doc(id).get());
    if (!group || group.organizationId !== organizationId) {
      throw new NotFoundException('Grupo no encontrado.');
    }
    return group;
  }

  private async getActive(
    organizationId: string,
    id: string,
  ): Promise<WhatsappGroup> {
    const group = await this.getOwned(organizationId, id);
    if (group.status !== 'ACTIVE' || !group.groupId) {
      throw new BadRequestException(
        'El grupo aun no esta activo (Meta no ha confirmado su creacion).',
      );
    }
    return group;
  }

  private async patch(
    id: string,
    data: Partial<Omit<WhatsappGroup, 'id'>>,
  ): Promise<WhatsappGroup> {
    const ref = this.collection.doc(id);
    await ref.update({ ...data, updatedAt: new Date().toISOString() });
    return docToEntity<WhatsappGroup>(await ref.get())!;
  }

  private async callMeta<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      throw new BadGatewayException(
        `Error de WhatsApp: ${(err as Error).message}`,
      );
    }
  }

  private async findByGroupId(
    groupId?: string,
  ): Promise<WhatsappGroup | null> {
    if (!groupId) return null;
    const snap = await this.collection
      .where('groupId', '==', groupId)
      .limit(1)
      .get();
    return snap.empty ? null : docToEntity<WhatsappGroup>(snap.docs[0]);
  }

  private async findByRequestId(
    requestId?: string,
  ): Promise<WhatsappGroup | null> {
    if (!requestId) return null;
    const snap = await this.collection
      .where('requestId', '==', requestId)
      .limit(1)
      .get();
    return snap.empty ? null : docToEntity<WhatsappGroup>(snap.docs[0]);
  }

  private async findByRequestIdWithRetry(
    requestId?: string,
  ): Promise<WhatsappGroup | null> {
    let doc = await this.findByRequestId(requestId);
    for (const delay of LIFECYCLE_RETRY_DELAYS_MS) {
      if (doc || !requestId) break;
      await new Promise((r) => setTimeout(r, delay));
      doc = await this.findByRequestId(requestId);
    }
    return doc;
  }
}
