/**
 * Enumeraciones y tipos literales del dominio GEN-Task.
 * Estos valores son compartidos entre backend (NestJS) y frontend (Next.js).
 */

/** Roles del sistema. SUPER_ADMIN es un rol global; ADMIN y GESTOR son por organizacion. */
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  GESTOR = 'GESTOR',
  HOST = 'HOST',
  BOT_WHATSAPP = 'BOT_WHATSAPP',
}

/** Rol dentro de una membresia de organizacion (no incluye roles globales ni de WhatsApp). */
export type MembershipRole = UserRole.ADMIN | UserRole.GESTOR;

/** Tipo de un estado de proyecto: abierto o cerrado. */
export enum StatusType {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

/** Tipos de campo personalizado soportados en la primera version. */
export enum CustomFieldType {
  TEXT = 'TEXT',
  NUMBER = 'NUMBER',
  DATE = 'DATE',
  FILE = 'FILE',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  LIST = 'LIST',
  LINK = 'LINK',
}

/** Origen de una actividad. */
export enum ActivitySource {
  WEB = 'WEB',
  WHATSAPP = 'WHATSAPP',
}

/** Operadores para condiciones de reglas y restricciones de visibilidad. */
export enum ConditionOperator {
  EQUALS = 'EQUALS',
  NOT_EQUALS = 'NOT_EQUALS',
  IN = 'IN',
  NOT_IN = 'NOT_IN',
  IS_EMPTY = 'IS_EMPTY',
  IS_NOT_EMPTY = 'IS_NOT_EMPTY',
}

/** Operador logico que combina multiples condiciones. */
export enum LogicalOperator {
  AND = 'AND',
  OR = 'OR',
}

/** Eventos que pueden disparar una regla del proyecto. */
export enum RuleEvent {
  ON_ACTIVITY_CREATED = 'ON_ACTIVITY_CREATED',
  ON_FIELD_UPDATED = 'ON_FIELD_UPDATED',
  ON_STATUS_CHANGED = 'ON_STATUS_CHANGED',
}

/** Tipos de accion que puede ejecutar una regla. */
export enum RuleActionType {
  SEND_WHATSAPP = 'SEND_WHATSAPP',
  CHANGE_STATUS = 'CHANGE_STATUS',
  REQUEST_HOST_INFORMATION = 'REQUEST_HOST_INFORMATION',
  ASSIGN_RESPONSIBLE = 'ASSIGN_RESPONSIBLE',
  REGISTER_HISTORY_EVENT = 'REGISTER_HISTORY_EVENT',
  /** Crea un campo personalizado en el proyecto (idempotente por etiqueta). */
  CREATE_CUSTOM_FIELD = 'CREATE_CUSTOM_FIELD',
}

/**
 * Destinatario de la accion SEND_WHATSAPP / REQUEST_HOST_INFORMATION de una regla.
 * Si no se especifica, por compatibilidad se asume HOST (comportamiento previo).
 */
export enum WhatsappRecipientType {
  /** Host asociado a la actividad (`activity.hostId`). Comportamiento por defecto. */
  HOST = 'HOST',
  /** Un miembro concreto de la organizacion (admin/gestor), por `recipientUserId`. */
  MEMBER = 'MEMBER',
  /** Todos los usuarios asignados como responsables de la actividad. */
  RESPONSIBLES = 'RESPONSIBLES',
  /** Un numero de telefono fijo escrito en la regla (`recipientPhone`). */
  PHONE = 'PHONE',
}

/**
 * Medio por el que se entrega una notificacion. Si una plantilla no define
 * canal, el valor por defecto es WHATSAPP.
 */
export enum NotificationChannel {
  WHATSAPP = 'WHATSAPP',
  EMAIL = 'EMAIL',
  BOTH = 'BOTH',
}

/** Estado del flujo de una sesion de WhatsApp. */
export enum WhatsappSessionState {
  IDLE = 'IDLE',
  SELECTING_ORGANIZATION = 'SELECTING_ORGANIZATION',
  SELECTING_PROJECT = 'SELECTING_PROJECT',
  CREATING_ACTIVITY = 'CREATING_ACTIVITY',
  WAITING_FIELD_VALUE = 'WAITING_FIELD_VALUE',
  CONSULTING_ACTIVITIES = 'CONSULTING_ACTIVITIES',
  EDITING_ACTIVITY = 'EDITING_ACTIVITY',
  ARCHIVING_ACTIVITY = 'ARCHIVING_ACTIVITY',
  MANUAL_MODE = 'MANUAL_MODE',
}

/** Direccion de un mensaje de WhatsApp. */
export enum MessageDirection {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
}

/** Quien envia un mensaje de WhatsApp. */
export enum MessageSenderType {
  HOST = 'HOST',
  BOT = 'BOT',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

/** Tipo de contenido de un mensaje de WhatsApp. */
export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  FILE = 'FILE',
  VIDEO = 'VIDEO',
}

/**
 * Nombres canonicos de las colecciones de Firestore.
 * Centralizados para evitar errores tipograficos y facilitar el tenant scoping.
 */
export const FirestoreCollections = {
  USERS: 'users',
  ORGANIZATIONS: 'organizations',
  ORGANIZATION_MEMBERSHIPS: 'organization_memberships',
  PROJECTS: 'projects',
  ACTIVITIES: 'activities',
  ACTIVITY_STATUS_HISTORY: 'activity_status_history',
  GESTOR_ACCESS_RULES: 'gestor_access_rules',
  HOSTS: 'hosts',
  WHATSAPP_SESSIONS: 'whatsapp_sessions',
  WHATSAPP_CHATS: 'whatsapp_chats',
  WHATSAPP_MESSAGES: 'whatsapp_messages',
  MESSAGE_TEMPLATES: 'message_templates',
  CONTACTS: 'contacts',
} as const;

export type FirestoreCollection =
  (typeof FirestoreCollections)[keyof typeof FirestoreCollections];
