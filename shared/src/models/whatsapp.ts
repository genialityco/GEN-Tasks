import { IsoDate } from './common';
import {
  MessageDirection,
  MessageSenderType,
  MessageType,
  NotificationChannel,
  WhatsappSessionState,
} from '../enums';

/**
 * Host: usuario que solo existe via WhatsApp. No inicia sesion en la web.
 * Se identifica por su numero de telefono dentro de una organizacion.
 */
export interface Host {
  id: string;
  organizationId: string;
  phone: string;
  name?: string;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/** Sesion conversacional del bot por numero de telefono. Guarda el contexto del flujo. */
export interface WhatsappSession {
  id: string;
  organizationId?: string;
  projectId?: string;
  hostId?: string;
  phone: string;
  state: WhatsappSessionState;
  currentActivityId?: string;
  currentFieldIndex?: number;
  tempData?: Record<string, unknown>;
  /** Si false, el bot no responde automaticamente (chat en modo manual). */
  botEnabled: boolean;
  lastActivityAt: IsoDate;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/** Conversacion de WhatsApp asociada a un telefono dentro de una organizacion. */
export interface WhatsappChat {
  id: string;
  organizationId: string;
  phone: string;
  hostId?: string;
  /** Control manual: cuando un Admin toma el chat, el bot se desactiva solo aqui. */
  botEnabled: boolean;
  lastMessageAt?: IsoDate;
  lastMessagePreview?: string;
  /**
   * Nombre legible del contacto cuando el telefono corresponde a un miembro de
   * la organizacion (admin o gestor). Se resuelve al listar los chats cruzando
   * el telefono con los miembros; ausente para numeros externos.
   */
  contactName?: string;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/** Mensaje individual de WhatsApp (entrante o saliente). */
export interface WhatsappMessage {
  id: string;
  organizationId: string;
  chatId: string;
  phone: string;
  direction: MessageDirection;
  senderType: MessageSenderType;
  messageType: MessageType;
  content?: string;
  mediaUrl?: string;
  createdAt: IsoDate;
}

/** Plantilla de mensaje configurable por organizacion. */
export interface MessageTemplate {
  id: string;
  organizationId: string;
  /** Clave logica del mensaje, ej: STATUS_CHANGED, REQUEST_INFO, CONFIRMATION, ERROR. */
  key: string;
  name: string;
  /** Cuerpo con placeholders, ej: "Tu actividad {{name}} cambio a {{status}}". */
  body: string;
  /**
   * Asunto del correo (solo aplica a los canales EMAIL/BOTH). Admite los mismos
   * placeholders `{{...}}` que el cuerpo. Si esta vacio, se usa un asunto por
   * defecto. No tiene efecto en el canal WHATSAPP.
   */
  subject?: string;
  /**
   * Medio de entrega de la notificacion. Ausente = WHATSAPP (por defecto), para
   * conservar el comportamiento de las plantillas creadas antes de este campo.
   */
  channel?: NotificationChannel;
  isActive: boolean;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/**
 * Estado de un grupo de WhatsApp (Groups API de Meta). La creacion es
 * asincrona: el POST devuelve un `request_id` y el resultado llega despues por
 * el webhook `group_lifecycle_update`.
 */
export type WhatsappGroupStatus = 'PENDING' | 'ACTIVE' | 'FAILED' | 'DELETED';

/** Modo de ingreso al grupo por enlace de invitacion. */
export type WhatsappGroupJoinApprovalMode = 'auto_approve' | 'approval_required';

/** Grupo de WhatsApp creado desde la plataforma via Groups API. */
export interface WhatsappGroup {
  id: string;
  organizationId: string;
  /** `request_id` devuelto por Meta al crear; enlaza el webhook con este doc. */
  requestId: string;
  /** Id del grupo en Meta. Ausente mientras la creacion esta pendiente. */
  groupId?: string;
  subject: string;
  description?: string;
  joinApprovalMode: WhatsappGroupJoinApprovalMode;
  status: WhatsappGroupStatus;
  inviteLink?: string;
  /** Telefonos (wa_id) de los participantes actuales, segun los webhooks. */
  participants: string[];
  /** Mensaje de error de Meta cuando la creacion falla. */
  error?: string;
  createdBy?: string;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}
