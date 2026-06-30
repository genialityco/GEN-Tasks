import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Activity,
  ActivityCustomField,
  ActivitySource,
  CustomFieldType,
  FirestoreCollections,
  Host,
  LogicalOperator,
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
import { evaluateConditions } from '../common/rule-evaluation';
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

/** Horas de inactividad tras las que una sesion en flujo expira y vuelve al menu. */
const SESSION_TIMEOUT_HOURS = 24;

/** Cuantas actividades del Host se listan como maximo en los flujos del bot. */
const HOST_ACTIVITIES_LIMIT = 10;

/**
 * Contexto temporal acumulado durante la creacion de una actividad por el bot.
 * Es un `type` (no `interface`) para que sea asignable a `tempData`
 * (`Record<string, unknown>`) de la sesion.
 */
type CreationTempData = {
  name?: string;
  values?: Record<string, unknown>;
  /** Adjuntos (URLs) acumulados para el campo foto/video/archivo en curso. */
  attachments?: string[];
};

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
    const chats = snapshotToEntities<WhatsappChat>(snap);
    return chats.sort((a, b) =>
      (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
    );
  }

  async listMessages(chatId: string): Promise<WhatsappMessage[]> {
    const snap = await this.messages
      .where('chatId', '==', chatId)
      .get();
    const msgs = snapshotToEntities<WhatsappMessage>(snap);
    return msgs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  // ----------------------------------------------------------------------
  // Control manual del chat
  // ----------------------------------------------------------------------

  /** Activa/desactiva el bot SOLO para este chat (no afecta a la organizacion). */
  async toggleBot(chatId: string, botEnabled: boolean): Promise<WhatsappChat> {
    const ref = this.chats.doc(chatId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Chat no encontrado.');
    const existing = docToEntity<WhatsappChat>(snap)!;
    if (!(await this.featureEnabled(existing.organizationId, 'manualChatEnabled'))) {
      throw new ForbiddenException(
        'El chat manual no esta habilitado para esta organizacion.',
      );
    }
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
    if (!(await this.featureEnabled(chat.organizationId, 'manualChatEnabled'))) {
      throw new ForbiddenException(
        'El chat manual no esta habilitado para esta organizacion.',
      );
    }

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

    // Gate de funcionalidad: si el SUPER_ADMIN no habilito WhatsApp para la
    // organizacion, no se procesa el mensaje (la org no usa el canal).
    if (!(await this.featureEnabled(organizationId, 'whatsappEnabled'))) {
      this.logger.debug(
        `WhatsApp deshabilitado para la organizacion ${organizationId}; mensaje ignorado.`,
      );
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
   * Procesa el texto del Host segun el estado de su sesion. Flujos soportados:
   *  1) Crear actividad (nombre + campos personalizados).
   *  2) Consultar mis actividades (lista + detalle).
   *  3) Editar una actividad (elegir actividad -> campo -> nuevo valor).
   *  4) Archivar una actividad (elegir actividad -> confirmar).
   * Reiniciable en cualquier momento con la palabra INICIO. Las sesiones en un
   * flujo activo expiran por inactividad (ver SESSION_TIMEOUT_HOURS).
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
      await this.resetSession(session.id);
      return this.reply(chat, this.menuText());
    }

    // Expiracion por inactividad: si la sesion esta en un flujo activo y paso
    // demasiado tiempo desde el ultimo mensaje, se reinicia al menu.
    if (
      session.state !== WhatsappSessionState.IDLE &&
      this.isSessionExpired(session)
    ) {
      await this.resetSession(session.id);
      return this.reply(
        chat,
        `Tu sesion expiro por inactividad (${SESSION_TIMEOUT_HOURS} horas). Volvamos a empezar.\n\n${this.menuText()}`,
      );
    }

    switch (session.state) {
      case WhatsappSessionState.CREATING_ACTIVITY:
      case WhatsappSessionState.WAITING_FIELD_VALUE:
        return this.handleCreationStep(session, chat, host, text, msg.mediaUrl);

      case WhatsappSessionState.CONSULTING_ACTIVITIES:
        return this.handleConsultSelection(session, chat, text);

      case WhatsappSessionState.EDITING_ACTIVITY:
        return this.handleEditStep(session, chat, host, text);

      case WhatsappSessionState.ARCHIVING_ACTIVITY:
        return this.handleArchiveSelection(session, chat, text);

      case WhatsappSessionState.IDLE:
      default:
        if (lower === '1' || lower.startsWith('crear')) {
          return this.startCreation(session, chat);
        }
        if (lower === '2' || lower.startsWith('consultar')) {
          return this.startConsult(session, chat, host);
        }
        if (lower === '3' || lower.startsWith('editar')) {
          return this.startEdit(session, chat, host);
        }
        if (lower === '4' || lower.startsWith('archivar')) {
          return this.startArchive(session, chat, host);
        }
        return this.reply(chat, this.menuText());
    }
  }

  private menuText(): string {
    return [
      'Bienvenido a GEN-Task. Escribe el numero de una opcion:',
      '1) Crear actividad',
      '2) Consultar mis actividades',
      '3) Editar una actividad',
      '4) Archivar una actividad',
      '',
      'En cualquier momento escribe INICIO para volver a este menu.',
    ].join('\n');
  }

  /** Una sesion en flujo expira si su ultimo mensaje supera el umbral de inactividad. */
  private isSessionExpired(session: WhatsappSession): boolean {
    const last = Date.parse(session.lastActivityAt);
    if (Number.isNaN(last)) return false;
    return Date.now() - last > SESSION_TIMEOUT_HOURS * 60 * 60 * 1000;
  }

  /**
   * Reinicia la sesion al menu. Limpia `tempData` (el contexto del flujo en
   * curso); el resto de campos auxiliares (projectId, currentFieldIndex, ...) los
   * reinicializa cada flujo al arrancar, por lo que un valor residual nunca se
   * usa antes de reescribirse.
   */
  private async resetSession(sessionId: string): Promise<void> {
    await this.updateSession(sessionId, {
      state: WhatsappSessionState.IDLE,
      tempData: {},
    });
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
    mediaUrl?: string,
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

    const fields = this.botFields(project, undefined, true);
    const tempData = (session.tempData ?? {}) as CreationTempData;
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

    // Campos de adjunto (foto/video/archivo): se recolectan por separado,
    // permitiendo enviar varios y cerrar con "listo".
    if (field && this.isAttachmentField(field)) {
      return this.handleAttachmentStep(
        session, chat, host, project, fields, tempData, index, field, text, mediaUrl,
      );
    }

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

  /** Indica si un campo almacena adjuntos (foto, video o archivo). */
  private isAttachmentField(field: ActivityCustomField): boolean {
    return (
      field.type === CustomFieldType.IMAGE ||
      field.type === CustomFieldType.VIDEO ||
      field.type === CustomFieldType.FILE
    );
  }

  /**
   * Recolecta los adjuntos de un campo foto/video/archivo. Acumula cada media
   * recibida en `tempData.attachments` y avanza al siguiente campo cuando el Host
   * escribe "listo" (validando el minimo si el campo es obligatorio).
   */
  private async handleAttachmentStep(
    session: WhatsappSession,
    chat: WhatsappChat,
    host: Host,
    project: Project,
    fields: ActivityCustomField[],
    tempData: CreationTempData,
    index: number,
    field: ActivityCustomField,
    text: string,
    mediaUrl?: string,
  ): Promise<void> {
    const attachments = tempData.attachments ?? [];

    // Llego un archivo: se acumula y se sigue esperando mas (o "listo").
    if (mediaUrl) {
      const next = [...attachments, mediaUrl];
      await this.updateSession(session.id, {
        tempData: { ...tempData, attachments: next },
      });
      return this.reply(
        chat,
        `Archivo ${next.length} recibido. Envia mas, o escribe *listo* para continuar.`,
      );
    }

    // El Host escribe "listo": cierra la recoleccion del campo.
    if (text.trim().toLowerCase() === 'listo') {
      if (attachments.length === 0 && field.required) {
        return this.reply(chat, `Envia al menos un archivo para *${field.label}*.`);
      }
      const values = tempData.values ?? {};
      if (attachments.length > 0) values[field.key] = attachments;
      return this.advanceCreation(
        session,
        chat,
        host,
        project,
        fields,
        { ...tempData, values, attachments: [] },
        index + 1,
      );
    }

    // Cualquier otro texto: recordar como continuar.
    return this.reply(
      chat,
      `Envia el archivo para *${field.label}*, o escribe *listo* para continuar.`,
    );
  }

  /** Avanza al siguiente campo o finaliza creando la actividad. */
  private async advanceCreation(
    session: WhatsappSession,
    chat: WhatsappChat,
    host: Host,
    project: Project,
    fields: ActivityCustomField[],
    tempData: CreationTempData,
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

  /** Devuelve las actividades activas del Host (las mas recientes primero). */
  private async loadHostActivities(host: Host): Promise<Activity[]> {
    const snap = await this.activities
      .where('hostId', '==', host.id)
      .where('isArchived', '==', false)
      .limit(HOST_ACTIVITIES_LIMIT)
      .get();
    const activities = snapshotToEntities<Activity>(snap);
    return activities.sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
  }

  /** Texto numerado de una lista de actividades (con su estado). */
  private activityListText(
    activities: Activity[],
    project: Project | null,
  ): string {
    const statusName = (id: string) =>
      project?.statuses.find((s) => s.id === id)?.name ?? id;
    return activities
      .map((a, i) => `${i + 1}) ${a.name} — ${statusName(a.statusId)}`)
      .join('\n');
  }

  /**
   * Valida la seleccion numerica del Host sobre una lista de ids guardada en la
   * sesion. Devuelve el id elegido o null (y avisa al Host) si es invalida.
   */
  private async pickFromList(
    chat: WhatsappChat,
    ids: string[],
    text: string,
  ): Promise<string | null> {
    const idx = Number(text) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= ids.length) {
      await this.reply(
        chat,
        `Selecciona un numero entre 1 y ${ids.length}, o escribe INICIO para el menu.`,
      );
      return null;
    }
    return ids[idx];
  }

  // ── Consultar ───────────────────────────────────────────────────────────

  /** Inicia la consulta: lista las actividades del Host y espera una seleccion. */
  private async startConsult(
    session: WhatsappSession,
    chat: WhatsappChat,
    host: Host,
  ): Promise<void> {
    const activities = await this.loadHostActivities(host);
    if (activities.length === 0) {
      return this.reply(chat, 'No tienes actividades registradas. Escribe 1 para crear una.');
    }
    const project = docToEntity<Project>(
      await this.projects.doc(activities[0].projectId).get(),
    );
    await this.updateSession(session.id, {
      state: WhatsappSessionState.CONSULTING_ACTIVITIES,
      tempData: { activityIds: activities.map((a) => a.id) },
    });
    return this.reply(
      chat,
      [
        'Tus actividades:',
        this.activityListText(activities, project),
        '',
        'Escribe el numero de una actividad para ver su detalle, o INICIO para el menu.',
      ].join('\n'),
    );
  }

  /** Muestra el detalle de la actividad elegida (campos + estado). */
  private async handleConsultSelection(
    session: WhatsappSession,
    chat: WhatsappChat,
    text: string,
  ): Promise<void> {
    const ids = ((session.tempData?.activityIds as string[]) ?? []);
    const activityId = await this.pickFromList(chat, ids, text);
    if (!activityId) return;

    const activity = docToEntity<Activity>(
      await this.activities.doc(activityId).get(),
    );
    if (!activity) {
      await this.resetSession(session.id);
      return this.reply(chat, 'La actividad ya no esta disponible. ' + this.menuText());
    }
    const project = docToEntity<Project>(
      await this.projects.doc(activity.projectId).get(),
    );
    await this.resetSession(session.id);
    return this.reply(chat, this.activityDetailText(activity, project));
  }

  /** Construye el detalle legible de una actividad: nombre, estado y campos. */
  private activityDetailText(
    activity: Activity,
    project: Project | null,
  ): string {
    const statusName =
      project?.statuses.find((s) => s.id === activity.statusId)?.name ??
      activity.statusId;
    const lines = [`*${activity.name}*`, `Estado: ${statusName}`];
    const fields = this.botFields(project ?? ({ customFields: [] } as unknown as Project), activity);
    for (const field of fields) {
      const value = activity.customFieldValues?.[field.key];
      if (value === undefined || value === null || value === '') continue;
      lines.push(`${field.label}: ${this.displayValue(field, value)}`);
    }
    lines.push('', 'Escribe INICIO para volver al menu.');
    return lines.join('\n');
  }

  /** Representa el valor de un campo para mostrarlo (resuelve etiquetas de LIST). */
  private displayValue(field: ActivityCustomField, value: unknown): string {
    if (field.type === CustomFieldType.LIST && field.options?.length) {
      const opt = field.options.find((o) => o.value === value);
      if (opt) return opt.label;
    }
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  }

  // ── Editar ──────────────────────────────────────────────────────────────

  /** Inicia la edicion: lista actividades y espera elegir cual editar. */
  private async startEdit(
    session: WhatsappSession,
    chat: WhatsappChat,
    host: Host,
  ): Promise<void> {
    const activities = await this.loadHostActivities(host);
    if (activities.length === 0) {
      return this.reply(chat, 'No tienes actividades para editar. Escribe 1 para crear una.');
    }
    const project = docToEntity<Project>(
      await this.projects.doc(activities[0].projectId).get(),
    );
    await this.updateSession(session.id, {
      state: WhatsappSessionState.EDITING_ACTIVITY,
      tempData: {
        stage: 'SELECT_ACTIVITY',
        activityIds: activities.map((a) => a.id),
      },
    });
    return this.reply(
      chat,
      [
        'Que actividad quieres editar?',
        this.activityListText(activities, project),
        '',
        'Escribe el numero, o INICIO para cancelar.',
      ].join('\n'),
    );
  }

  /** Maquina de sub-pasos de la edicion (elegir actividad -> campo -> valor). */
  private async handleEditStep(
    session: WhatsappSession,
    chat: WhatsappChat,
    host: Host,
    text: string,
  ): Promise<void> {
    const temp = (session.tempData ?? {}) as {
      stage?: string;
      activityIds?: string[];
      activityId?: string;
      fieldKeys?: string[];
      fieldKey?: string;
    };

    if (temp.stage === 'SELECT_ACTIVITY') {
      const activityId = await this.pickFromList(chat, temp.activityIds ?? [], text);
      if (!activityId) return;
      const activity = docToEntity<Activity>(await this.activities.doc(activityId).get());
      const project = activity
        ? docToEntity<Project>(await this.projects.doc(activity.projectId).get())
        : null;
      if (!activity || !project) {
        await this.resetSession(session.id);
        return this.reply(chat, 'La actividad ya no esta disponible. ' + this.menuText());
      }
      const fields = this.botFields(project, activity);
      if (fields.length === 0) {
        await this.resetSession(session.id);
        return this.reply(chat, 'Esta actividad no tiene campos editables. ' + this.menuText());
      }
      await this.updateSession(session.id, {
        currentActivityId: activityId,
        tempData: {
          stage: 'SELECT_FIELD',
          activityId,
          fieldKeys: fields.map((f) => f.key),
        },
      });
      const list = fields.map((f, i) => `${i + 1}) ${f.label}`).join('\n');
      return this.reply(
        chat,
        ['Que campo quieres editar?', list, '', 'Escribe el numero, o INICIO para cancelar.'].join('\n'),
      );
    }

    if (temp.stage === 'SELECT_FIELD') {
      const fieldKey = await this.pickFromList(chat, temp.fieldKeys ?? [], text);
      if (!fieldKey) return;
      const activity = docToEntity<Activity>(
        await this.activities.doc(temp.activityId ?? '').get(),
      );
      const project = activity
        ? docToEntity<Project>(await this.projects.doc(activity.projectId).get())
        : null;
      const field = this.botFields(project ?? ({ customFields: [] } as unknown as Project), activity ?? undefined).find(
        (f) => f.key === fieldKey,
      );
      if (!field) {
        await this.resetSession(session.id);
        return this.reply(chat, 'El campo ya no esta disponible. ' + this.menuText());
      }
      await this.updateSession(session.id, {
        tempData: { ...temp, stage: 'ENTER_VALUE', fieldKey },
      });
      return this.reply(chat, this.fieldPrompt(field));
    }

    if (temp.stage === 'ENTER_VALUE') {
      const activity = docToEntity<Activity>(
        await this.activities.doc(temp.activityId ?? '').get(),
      );
      const project = activity
        ? docToEntity<Project>(await this.projects.doc(activity.projectId).get())
        : null;
      const field = this.botFields(project ?? ({ customFields: [] } as unknown as Project), activity ?? undefined).find(
        (f) => f.key === temp.fieldKey,
      );
      if (!activity || !field) {
        await this.resetSession(session.id);
        return this.reply(chat, 'La actividad ya no esta disponible. ' + this.menuText());
      }
      const parsed = this.parseFieldValue(field, text);
      if (parsed.error) return this.reply(chat, parsed.error);

      const customFieldValues = { ...(activity.customFieldValues ?? {}) };
      if (parsed.value === undefined) {
        delete customFieldValues[field.key];
      } else {
        customFieldValues[field.key] = parsed.value;
      }
      await this.activities.doc(activity.id).update({
        customFieldValues,
        updatedAt: new Date().toISOString(),
      });
      await this.resetSession(session.id);
      return this.reply(
        chat,
        `Listo. *${field.label}* actualizado en *${activity.name}*.\nEscribe INICIO para el menu.`,
      );
    }

    // Etapa desconocida: reinicia por seguridad.
    await this.resetSession(session.id);
    return this.reply(chat, this.menuText());
  }

  // ── Archivar ──────────────────────────────────────────────────────────────

  /** Inicia el archivado: lista actividades y espera elegir cual archivar. */
  private async startArchive(
    session: WhatsappSession,
    chat: WhatsappChat,
    host: Host,
  ): Promise<void> {
    const activities = await this.loadHostActivities(host);
    if (activities.length === 0) {
      return this.reply(chat, 'No tienes actividades para archivar.');
    }
    const project = docToEntity<Project>(
      await this.projects.doc(activities[0].projectId).get(),
    );
    await this.updateSession(session.id, {
      state: WhatsappSessionState.ARCHIVING_ACTIVITY,
      tempData: { activityIds: activities.map((a) => a.id) },
    });
    return this.reply(
      chat,
      [
        'Que actividad quieres archivar?',
        this.activityListText(activities, project),
        '',
        'Escribe el numero, o INICIO para cancelar.',
      ].join('\n'),
    );
  }

  /** Archiva la actividad elegida (borrado logico: isArchived = true). */
  private async handleArchiveSelection(
    session: WhatsappSession,
    chat: WhatsappChat,
    text: string,
  ): Promise<void> {
    const ids = ((session.tempData?.activityIds as string[]) ?? []);
    const activityId = await this.pickFromList(chat, ids, text);
    if (!activityId) return;

    const activity = docToEntity<Activity>(
      await this.activities.doc(activityId).get(),
    );
    if (!activity) {
      await this.resetSession(session.id);
      return this.reply(chat, 'La actividad ya no esta disponible. ' + this.menuText());
    }
    await this.activities.doc(activityId).update({
      isArchived: true,
      updatedAt: new Date().toISOString(),
    });
    await this.resetSession(session.id);
    return this.reply(
      chat,
      `Actividad *${activity.name}* archivada.\nEscribe INICIO para el menu.`,
    );
  }

  // ----------------------------------------------------------------------
  // Helpers del bot
  // ----------------------------------------------------------------------

  /**
   * Campos personalizados activos del proyecto que el bot debe solicitar.
   *
   * - Sin `activity` + `creationMode=true`: solo campos requeridos sin condiciones
   *   de visibilidad. Mantiene la creación simple (nombre + obligatorios).
   * - Sin `activity` + `creationMode=false`: todos los campos sin condiciones.
   * - Con `activity`: campos cuyas condiciones de visibilidad se cumplen para
   *   el estado actual de esa actividad (modo edición / consulta).
   */
  private botFields(
    project: Project,
    activity?: Partial<Activity>,
    creationMode = false,
  ): ActivityCustomField[] {
    return (project.customFields ?? [])
      .filter((f) => {
        if (!f.isActive || f.isArchived) return false;
        const conditions = f.visibilityConditions ?? [];
        if (conditions.length === 0) {
          // En creación: solo los obligatorios para no sobrecargar al gestor.
          if (creationMode && !f.required) return false;
          return true;
        }
        if (!activity) return false;
        return evaluateConditions(
          conditions,
          f.visibilityLogicalOperator ?? LogicalOperator.AND,
          activity,
        );
      })
      .sort((a, b) => a.order - b.order);
  }

  private fieldPrompt(field: ActivityCustomField): string {
    // Campos de adjunto: se pide enviar el/los archivo(s) y cerrar con "listo".
    if (this.isAttachmentField(field)) {
      const kind =
        field.type === CustomFieldType.IMAGE
          ? 'la(s) foto(s)'
          : field.type === CustomFieldType.VIDEO
            ? 'el/los video(s)'
            : 'el/los archivo(s)';
      const optional = field.required ? '' : ' (o escribe *listo* para omitir)';
      return `Envia ${kind} para *${field.label}* y escribe *listo* al terminar${optional}.`;
    }
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

  /**
   * Indica si una organizacion tiene habilitada una funcionalidad
   * (gate controlado por el SUPER_ADMIN en `enabledFeatures`). Ausencia del flag
   * se interpreta como habilitado, para no romper organizaciones preexistentes.
   */
  private async featureEnabled(
    organizationId: string,
    feature: keyof Organization['enabledFeatures'],
  ): Promise<boolean> {
    const org = docToEntity<Organization>(
      await this.organizations.doc(organizationId).get(),
    );
    return org?.enabledFeatures?.[feature] !== false;
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
