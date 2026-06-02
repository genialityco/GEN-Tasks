import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  FirestoreCollections,
  MessageDirection,
  MessageSenderType,
  MessageType,
  WhatsappChat,
  WhatsappMessage,
  WhatsappSession,
  WhatsappSessionState,
} from '@gen-task/shared';
import { FirebaseService } from '../firebase/firebase.service';
import {
  docToEntity,
  snapshotToEntities,
} from '../firebase/firestore.helpers';
import { HostsService } from '../hosts/hosts.service';
import { WhatsappCloudApiService } from './whatsapp-cloud-api.service';
import { OrganizationResolverService } from './organization-resolver.service';

/** Forma simplificada de un mensaje entrante ya normalizado. */
export interface NormalizedInboundMessage {
  phone: string;
  inboundPhoneNumberId?: string;
  text?: string;
  messageType: MessageType;
  mediaUrl?: string;
  profileName?: string;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly hosts: HostsService,
    private readonly cloudApi: WhatsappCloudApiService,
    private readonly orgResolver: OrganizationResolverService,
  ) {}

  private get chats() {
    return this.firebase.firestore.collection(
      FirestoreCollections.WHATSAPP_CHATS,
    );
  }
  private get messages() {
    return this.firebase.firestore.collection(
      FirestoreCollections.WHATSAPP_MESSAGES,
    );
  }
  private get sessions() {
    return this.firebase.firestore.collection(
      FirestoreCollections.WHATSAPP_SESSIONS,
    );
  }

  // ----------------------------------------------------------------------
  // Lectura para el panel (Chat WhatsApp)
  // ----------------------------------------------------------------------

  async listChats(organizationId: string): Promise<WhatsappChat[]> {
    const snap = await this.chats
      .where('organizationId', '==', organizationId)
      .get();
    return snapshotToEntities<WhatsappChat>(snap);
  }

  async listMessages(chatId: string): Promise<WhatsappMessage[]> {
    const snap = await this.messages
      .where('chatId', '==', chatId)
      .orderBy('createdAt', 'asc')
      .get();
    return snapshotToEntities<WhatsappMessage>(snap);
  }

  // ----------------------------------------------------------------------
  // Control manual del chat
  // ----------------------------------------------------------------------

  /** Activa/desactiva el bot SOLO para este chat (no afecta a la organizacion). */
  async toggleBot(chatId: string, botEnabled: boolean): Promise<WhatsappChat> {
    const ref = this.chats.doc(chatId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Chat no encontrado.');
    await ref.update({ botEnabled, updatedAt: new Date().toISOString() });
    // Refleja el estado en la sesion para que el bot lo respete.
    const chat = docToEntity<WhatsappChat>(await ref.get())!;
    await this.setSessionBotEnabled(chat.phone, botEnabled);
    return chat;
  }

  /** Envia un mensaje manual desde la plataforma (Admin) y lo persiste. */
  async sendManualMessage(
    chatId: string,
    body: string,
    senderType: MessageSenderType = MessageSenderType.ADMIN,
  ): Promise<WhatsappMessage> {
    const chat = docToEntity<WhatsappChat>(await this.chats.doc(chatId).get());
    if (!chat) throw new NotFoundException('Chat no encontrado.');

    await this.cloudApi.sendText({ to: chat.phone, body });

    return this.persistMessage({
      organizationId: chat.organizationId,
      chatId,
      phone: chat.phone,
      direction: MessageDirection.OUTBOUND,
      senderType,
      messageType: MessageType.TEXT,
      content: body,
    });
  }

  /** Solicita actualizacion de informacion al Host (mensaje saliente del bot/admin). */
  async requestInformation(chatId: string, body: string): Promise<WhatsappMessage> {
    return this.sendManualMessage(chatId, body, MessageSenderType.BOT);
  }

  // ----------------------------------------------------------------------
  // Procesamiento de mensajes entrantes (webhook)
  // ----------------------------------------------------------------------

  /**
   * Procesa un mensaje entrante: resuelve organizacion, asegura host/chat/sesion,
   * persiste el mensaje y -si el bot esta habilitado para el chat- continua el
   * flujo. El flujo conversacional completo se implementa en la Fase 7.
   */
  async handleInbound(msg: NormalizedInboundMessage): Promise<void> {
    const organizationId = await this.orgResolver.resolve({
      phone: msg.phone,
      inboundPhoneNumberId: msg.inboundPhoneNumberId,
    });

    if (!organizationId) {
      this.logger.warn(
        `No se pudo resolver organizacion para ${msg.phone}. Pendiente seleccion.`,
      );
      // Aqui el bot deberia pedir seleccionar organizacion (Fase 7).
      return;
    }

    const host = await this.hosts.findOrCreate(
      organizationId,
      msg.phone,
      msg.profileName,
    );
    const chat = await this.ensureChat(organizationId, msg.phone, host.id);
    const session = await this.ensureSession(organizationId, msg.phone, host.id);

    await this.persistMessage({
      organizationId,
      chatId: chat.id,
      phone: msg.phone,
      direction: MessageDirection.INBOUND,
      senderType: MessageSenderType.HOST,
      messageType: msg.messageType,
      content: msg.text,
      mediaUrl: msg.mediaUrl,
    });

    // Respeta el modo manual: si el bot esta apagado para este chat, no responde.
    if (!chat.botEnabled || !session.botEnabled) {
      this.logger.debug(`Bot deshabilitado para ${msg.phone}; sin respuesta automatica.`);
      return;
    }

    // TODO (Fase 7): maquina de estados del bot (crear/consultar/editar/archivar).
    // Placeholder: eco de confirmacion de recepcion.
    const reply = 'Hemos recibido tu mensaje. Pronto podras gestionar tus actividades por aqui.';
    await this.cloudApi.sendText({ to: msg.phone, body: reply });
    await this.persistMessage({
      organizationId,
      chatId: chat.id,
      phone: msg.phone,
      direction: MessageDirection.OUTBOUND,
      senderType: MessageSenderType.BOT,
      messageType: MessageType.TEXT,
      content: reply,
    });
  }

  // ----------------------------------------------------------------------
  // Helpers de persistencia
  // ----------------------------------------------------------------------

  private async persistMessage(
    input: Omit<WhatsappMessage, 'id' | 'createdAt'>,
  ): Promise<WhatsappMessage> {
    const now = new Date().toISOString();
    const ref = this.messages.doc();
    const data: Omit<WhatsappMessage, 'id'> = { ...input, createdAt: now };
    await ref.set(data);
    await this.chats.doc(input.chatId).update({
      lastMessageAt: now,
      lastMessagePreview: input.content?.slice(0, 120) ?? `[${input.messageType}]`,
      updatedAt: now,
    });
    return { id: ref.id, ...data };
  }

  private async ensureChat(
    organizationId: string,
    phone: string,
    hostId: string,
  ): Promise<WhatsappChat> {
    const existing = await this.chats
      .where('organizationId', '==', organizationId)
      .where('phone', '==', phone)
      .limit(1)
      .get();
    if (!existing.empty) {
      return docToEntity<WhatsappChat>(existing.docs[0])!;
    }
    const now = new Date().toISOString();
    const ref = this.chats.doc();
    const data: Omit<WhatsappChat, 'id'> = {
      organizationId,
      phone,
      hostId,
      botEnabled: true,
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(data);
    return { id: ref.id, ...data };
  }

  private async ensureSession(
    organizationId: string,
    phone: string,
    hostId: string,
  ): Promise<WhatsappSession> {
    const existing = await this.sessions
      .where('phone', '==', phone)
      .limit(1)
      .get();
    const now = new Date().toISOString();
    if (!existing.empty) {
      const ref = existing.docs[0].ref;
      await ref.update({ lastActivityAt: now, updatedAt: now });
      return docToEntity<WhatsappSession>(await ref.get())!;
    }
    const ref = this.sessions.doc();
    const data: Omit<WhatsappSession, 'id'> = {
      organizationId,
      hostId,
      phone,
      state: WhatsappSessionState.IDLE,
      botEnabled: true,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(data);
    return { id: ref.id, ...data };
  }

  private async setSessionBotEnabled(
    phone: string,
    botEnabled: boolean,
  ): Promise<void> {
    const snap = await this.sessions.where('phone', '==', phone).limit(1).get();
    if (snap.empty) return;
    await snap.docs[0].ref.update({
      botEnabled,
      state: botEnabled
        ? WhatsappSessionState.IDLE
        : WhatsappSessionState.MANUAL_MODE,
      updatedAt: new Date().toISOString(),
    });
  }
}
