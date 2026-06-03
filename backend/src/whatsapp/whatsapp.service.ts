import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Activity,
  ActivityCustomField,
  ActivitySource,
  CustomFieldType,
  FirestoreCollections,
  Host,
  MessageDirection,
  MessageSenderType,
  MessageType,
  Organization,
  Project,
  ProjectStatus,
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
  private get projects() {
    return this.firebase.firestore.collection(FirestoreCollections.PROJECTS);
  }
  private get activities() {
    return this.firebase.firestore.collection(FirestoreCollections.ACTIVITIES);
  }
  private get organizations() {
    return this.firebase.firestore.collection(
      FirestoreCollections.ORGANIZATIONS,
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

  /**
   * Envia un mensaje del BOT a un telefono dado (asegurando el chat). Usado por
   * el motor de reglas (acciones SEND_WHATSAPP / REQUEST_HOST_INFORMATION).
   */
  async sendBotMessageToPhone(
    organizationId: string,
    phone: string,
    body: string,
  ): Promise<void> {
    const chat = await this.ensureChat(organizationId, phone);
    await this.cloudApi.sendText({ to: phone, body });
    await this.persistMessage({
      organizationId,
      chatId: chat.id,
      phone,
      direction: MessageDirection.OUTBOUND,
      senderType: MessageSenderType.BOT,
      messageType: MessageType.TEXT,
      content: body,
    });
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

    await this.processBotFlow(session, chat, host, msg);
  }

  // ----------------------------------------------------------------------
  // Maquina de estados del bot (Fase 7)
  // ----------------------------------------------------------------------

  /**
   * Procesa el texto del Host segun el estado de su sesion. Flujo soportado:
   * menu -> crear actividad (nombre + campos personalizados) y consultar
   * actividades propias. Reiniciable con la palabra INICIO.
   */
  private async processBotFlow(
    session: WhatsappSession,
    chat: WhatsappChat,
    host: Host,
    msg: NormalizedInboundMessage,
  ): Promise<void> {
    const text = (msg.text ?? '').trim();
    const lower = text.toLowerCase();

    // Reinicio global.
    if (lower === 'inicio' || lower === 'menu') {
      await this.updateSession(session.id, {
        state: WhatsappSessionState.IDLE,
        tempData: {},
        currentFieldIndex: undefined,
      });
      return this.reply(chat, this.menuText());
    }

    switch (session.state) {
      case WhatsappSessionState.CREATING_ACTIVITY:
      case WhatsappSessionState.WAITING_FIELD_VALUE:
        return this.handleCreationStep(session, chat, host, text);

      case WhatsappSessionState.IDLE:
      default:
        if (lower === '1' || lower.startsWith('crear')) {
          return this.startCreation(session, chat);
        }
        if (lower === '2' || lower.startsWith('consultar')) {
          return this.listHostActivities(chat, host);
        }
        return this.reply(chat, this.menuText());
    }
  }

  private menuText(): string {
    return [
      'Bienvenido a GEN-Task. Escribe el numero de una opcion:',
      '1) Crear actividad',
      '2) Consultar mis actividades',
      '',
      'En cualquier momento escribe INICIO para volver a este menu.',
    ].join('\n');
  }

  /** Inicia la creacion: resuelve proyecto y pide el nombre de la actividad. */
  private async startCreation(
    session: WhatsappSession,
    chat: WhatsappChat,
  ): Promise<void> {
    const project = await this.resolveProject(chat.organizationId);
    if (!project) {
      return this.reply(
        chat,
        'No hay un proyecto disponible para crear actividades. Contacta al administrador.',
      );
    }
    await this.updateSession(session.id, {
      state: WhatsappSessionState.WAITING_FIELD_VALUE,
      projectId: project.id,
      currentFieldIndex: -1, // -1 = esperando el nombre
      tempData: { values: {} },
    });
    return this.reply(chat, 'Vamos a crear una actividad.\nEscribe el *nombre* de la actividad:');
  }

  /** Procesa cada paso de la creacion (nombre y luego campos personalizados). */
  private async handleCreationStep(
    session: WhatsappSession,
    chat: WhatsappChat,
    host: Host,
    text: string,
  ): Promise<void> {
    if (!session.projectId) {
      await this.updateSession(session.id, { state: WhatsappSessionState.IDLE });
      return this.reply(chat, this.menuText());
    }
    const project = docToEntity<Project>(
      await this.projects.doc(session.projectId).get(),
    );
    if (!project) {
      await this.updateSession(session.id, { state: WhatsappSessionState.IDLE });
      return this.reply(chat, 'El proyecto ya no esta disponible.');
    }

    const fields = this.botFields(project);
    const tempData = (session.tempData ?? {}) as {
      name?: string;
      values?: Record<string, unknown>;
    };
    const values = tempData.values ?? {};
    const index = session.currentFieldIndex ?? -1;

    // Paso del nombre.
    if (index === -1) {
      if (!text) return this.reply(chat, 'El nombre no puede estar vacio. Escribe el nombre:');
      tempData.name = text;
      return this.advanceCreation(session, chat, host, project, fields, {
        ...tempData,
        values,
      }, 0);
    }

    // Paso de un campo personalizado.
    const field = fields[index];
    if (field) {
      const parsed = this.parseFieldValue(field, text);
      if (parsed.error) return this.reply(chat, parsed.error);
      if (parsed.value !== undefined) values[field.key] = parsed.value;
    }
    return this.advanceCreation(
      session,
      chat,
      host,
      project,
      fields,
      { ...tempData, values },
      index + 1,
    );
  }

  /** Avanza al siguiente campo o finaliza creando la actividad. */
  private async advanceCreation(
    session: WhatsappSession,
    chat: WhatsappChat,
    host: Host,
    project: Project,
    fields: ActivityCustomField[],
    tempData: { name?: string; values?: Record<string, unknown> },
    nextIndex: number,
  ): Promise<void> {
    if (nextIndex < fields.length) {
      await this.updateSession(session.id, {
        currentFieldIndex: nextIndex,
        tempData,
      });
      return this.reply(chat, this.fieldPrompt(fields[nextIndex]));
    }

    // No quedan campos: crear la actividad.
    const activity = await this.createActivityFromBot(
      project,
      host,
      tempData.name ?? 'Actividad sin nombre',
      tempData.values ?? {},
    );
    await this.updateSession(session.id, {
      state: WhatsappSessionState.IDLE,
      currentFieldIndex: undefined,
      tempData: {},
      currentActivityId: activity.id,
    });
    return this.reply(
      chat,
      `Actividad creada correctamente: *${activity.name}*.\nEscribe INICIO para volver al menu.`,
    );
  }

  /** Lista las actividades creadas por el propio Host. */
  private async listHostActivities(
    chat: WhatsappChat,
    host: Host,
  ): Promise<void> {
    const snap = await this.activities
      .where('hostId', '==', host.id)
      .where('isArchived', '==', false)
      .limit(10)
      .get();
    const activities = snapshotToEntities<Activity>(snap);
    if (activities.length === 0) {
      return this.reply(chat, 'No tienes actividades registradas. Escribe 1 para crear una.');
    }
    const project = docToEntity<Project>(
      await this.projects.doc(activities[0].projectId).get(),
    );
    const statusName = (id: string) =>
      project?.statuses.find((s) => s.id === id)?.name ?? id;
    const lines = activities.map(
      (a, i) => `${i + 1}) ${a.name} — ${statusName(a.statusId)}`,
    );
    return this.reply(
      chat,
      ['Tus actividades:', ...lines, '', 'Escribe INICIO para el menu.'].join('\n'),
    );
  }

  // ----------------------------------------------------------------------
  // Helpers del bot
  // ----------------------------------------------------------------------

  /** Campos personalizados activos del proyecto, ordenados, que el bot solicita. */
  private botFields(project: Project): ActivityCustomField[] {
    return (project.customFields ?? [])
      .filter((f) => f.isActive && !f.isArchived)
      .sort((a, b) => a.order - b.order);
  }

  private fieldPrompt(field: ActivityCustomField): string {
    let prompt = `Indica *${field.label}*`;
    if (field.type === CustomFieldType.LIST && field.options?.length) {
      const opts = field.options
        .filter((o) => o.isActive)
        .map((o, i) => `  ${i + 1}) ${o.label}`)
        .join('\n');
      prompt += ` (responde el numero):\n${opts}`;
    } else if (!field.required) {
      prompt += ' (o escribe "-" para omitir):';
    } else {
      prompt += ':';
    }
    return prompt;
  }

  /** Valida/normaliza el valor de un campo segun su tipo. */
  private parseFieldValue(
    field: ActivityCustomField,
    text: string,
  ): { value?: unknown; error?: string } {
    const skipped = text === '-' || text === '';
    if (skipped) {
      if (field.required) return { error: `*${field.label}* es obligatorio. Intenta de nuevo:` };
      return { value: undefined };
    }
    switch (field.type) {
      case CustomFieldType.NUMBER: {
        const n = Number(text);
        if (Number.isNaN(n)) return { error: 'Valor numerico invalido. Intenta de nuevo:' };
        return { value: n };
      }
      case CustomFieldType.LIST: {
        const active = (field.options ?? []).filter((o) => o.isActive);
        const idx = Number(text) - 1;
        const opt = active[idx];
        if (!opt) return { error: 'Opcion invalida. Responde el numero de la lista:' };
        return { value: opt.value };
      }
      default:
        return { value: text };
    }
  }

  /** Crea la actividad directamente (source = WHATSAPP, asociada al host). */
  private async createActivityFromBot(
    project: Project,
    host: Host,
    name: string,
    customFieldValues: Record<string, unknown>,
  ): Promise<Activity> {
    const statusId = this.defaultStatusId(project.statuses);
    const now = new Date().toISOString();
    const ref = this.activities.doc();
    const data: Omit<Activity, 'id'> = {
      organizationId: project.organizationId,
      projectId: project.id,
      name,
      statusId,
      responsibleIds: [],
      customFieldValues,
      source: ActivitySource.WHATSAPP,
      hostId: host.id,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(data);
    // Historial del estado inicial.
    await this.firebase.firestore
      .collection(FirestoreCollections.ACTIVITY_STATUS_HISTORY)
      .add({
        activityId: ref.id,
        organizationId: project.organizationId,
        projectId: project.id,
        newStatusId: statusId,
        changedBy: host.id,
        changedByRole: 'HOST',
        createdAt: now,
      });
    return { id: ref.id, ...data };
  }

  private defaultStatusId(statuses: ProjectStatus[]): string {
    const active = statuses
      .filter((s) => s.isActive && !s.isArchived)
      .sort((a, b) => a.order - b.order);
    const def = active.find((s) => s.isDefault) ?? active[0];
    return def?.id ?? '';
  }

  /** Resuelve el proyecto a usar: defaultProjectId de la org o el primero activo. */
  private async resolveProject(
    organizationId: string,
  ): Promise<Project | null> {
    const org = docToEntity<Organization>(
      await this.organizations.doc(organizationId).get(),
    );
    const defaultProjectId = org?.whatsappConfig?.defaultProjectId;
    if (defaultProjectId) {
      const project = docToEntity<Project>(
        await this.projects.doc(defaultProjectId).get(),
      );
      if (project && !project.isArchived) return project;
    }
    const snap = await this.projects
      .where('organizationId', '==', organizationId)
      .where('isArchived', '==', false)
      .limit(1)
      .get();
    return snap.empty ? null : docToEntity<Project>(snap.docs[0]);
  }

  /** Envia una respuesta del bot y la persiste. */
  private async reply(chat: WhatsappChat, body: string): Promise<void> {
    await this.cloudApi.sendText({ to: chat.phone, body });
    await this.persistMessage({
      organizationId: chat.organizationId,
      chatId: chat.id,
      phone: chat.phone,
      direction: MessageDirection.OUTBOUND,
      senderType: MessageSenderType.BOT,
      messageType: MessageType.TEXT,
      content: body,
    });
  }

  private async updateSession(
    sessionId: string,
    patch: Partial<WhatsappSession>,
  ): Promise<void> {
    await this.sessions.doc(sessionId).update({
      ...patch,
      lastActivityAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
    hostId?: string,
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
