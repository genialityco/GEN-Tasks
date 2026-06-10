import { IsoDate } from './common';
import {
  CustomFieldType,
  LogicalOperator,
  RuleActionType,
  RuleEvent,
  StatusType,
  UserRole,
  WhatsappRecipientType,
} from '../enums';

/** Estado configurable de un proyecto. */
export interface ProjectStatus {
  id: string;
  name: string;
  type: StatusType;
  order: number;
  color?: string;
  isDefault: boolean;
  isActive: boolean;
  isArchived: boolean;
}

/** Opcion de un campo personalizado tipo LIST. */
export interface CustomFieldOption {
  id: string;
  label: string;
  value: string;
  isActive: boolean;
}

/** Definicion de un campo personalizado del proyecto (heredado por sus actividades). */
export interface ActivityCustomField {
  id: string;
  /** Clave estable usada en customFieldValues. No cambia aunque cambie el label. */
  key: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  /** Estados en los que el campo se vuelve obligatorio. */
  requiredOnStatuses?: string[];
  visibleForRoles?: UserRole[];
  editableForRoles?: UserRole[];
  /**
   * Visibilidad condicional: el campo solo se muestra y se exige en las
   * actividades que cumplen estas condiciones (evaluadas sobre los valores de la
   * actividad). Vacio/ausente = el campo es visible en todas las actividades.
   * Lo usa, por ejemplo, la accion de trigger "Crear campo personalizado" para
   * que el campo aparezca solo bajo la condicion que disparo su creacion.
   */
  visibilityConditions?: RuleCondition[];
  visibilityLogicalOperator?: LogicalOperator;
  options?: CustomFieldOption[];
  order: number;
  isActive: boolean;
  isArchived: boolean;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/** Condicion evaluada sobre los campos de una actividad. */
export interface RuleCondition {
  fieldKey: string;
  operator:
    | 'EQUALS'
    | 'NOT_EQUALS'
    | 'IN'
    | 'NOT_IN'
    | 'IS_EMPTY'
    | 'IS_NOT_EMPTY';
  value?: unknown;
}

/** Accion que ejecuta una regla cuando sus condiciones se cumplen. */
export interface RuleAction {
  type: RuleActionType;
  payload: Record<string, unknown>;
}

/** Regla (condiciones + acciones) disparada por un evento del proyecto. */
export interface ProjectRule {
  id: string;
  name: string;
  event: RuleEvent;
  conditions: RuleCondition[];
  logicalOperator: LogicalOperator;
  actions: RuleAction[];
  /**
   * Solo para `event` = ON_STATUS_CHANGED: limita el disparo a una transicion
   * concreta. Si se define `fromStatusId`, la regla solo aplica cuando el estado
   * previo coincide; si se define `toStatusId`, solo cuando el estado nuevo
   * coincide. Vacios = cualquier transicion.
   */
  fromStatusId?: string;
  toStatusId?: string;
  isActive: boolean;
}

/**
 * Restriccion que debe cumplirse para permitir un cambio de estado de una
 * actividad. El cambio se PERMITE si `evaluateConditions(...)` es `true`; si es
 * `false`, el cambio se bloquea mostrando `message`. Ej.: para "si X esta vacio
 * no se puede cambiar de estado", usar una condicion `IS_NOT_EMPTY` sobre X.
 */
export interface StatusTransitionGuard {
  id: string;
  /** Si se define, la restriccion solo aplica al cambiar HACIA este estado; vacio = cualquier cambio. */
  toStatusId?: string;
  conditions: RuleCondition[];
  logicalOperator: LogicalOperator;
  /** Mensaje mostrado cuando la restriccion bloquea el cambio. */
  message?: string;
}

/**
 * Configuracion del semaforo de cumplimiento (deadline) del proyecto. La fecha
 * limite de una actividad es su `scheduledDate` (programacion) si existe; si no,
 * se calcula como `createdAt + defaultDurationDays`. El color se deriva de los
 * dias restantes hasta esa fecha limite.
 */
export interface ProjectCompliance {
  enabled: boolean;
  /** Dias desde la creacion para fijar la fecha limite cuando no hay fecha exacta. */
  defaultDurationDays?: number;
  /** Faltando <= estos dias para la fecha limite: amarillo (prioritario). */
  attentionThresholdDays: number;
  /** Faltando <= estos dias (incl. vencido): rojo (a punto de expirar/expirado). */
  criticalThresholdDays: number;
  /**
   * Alertas de cumplimiento por estado (SLA). Cada entrada define un plazo
   * "X dias desde la creacion" en el que la actividad deberia haber ALCANZADO
   * (o superado) un estado concreto. Si al llegar ese plazo la actividad aun no
   * lo alcanzo, se envia un WhatsApp automatico (una sola vez por actividad y
   * estado). Solo aplica cuando `enabled` es `true`.
   */
  statusAlerts?: StatusComplianceAlert[];
}

/**
 * Alerta de cumplimiento (SLA) asociada a un estado del proyecto. El plazo se
 * mide en dias desde la creacion de la actividad; el incumplimiento se evalua
 * comparando el `order` del estado actual de la actividad contra el `order` del
 * estado objetivo (`statusId`): si es menor, la actividad aun no lo alcanzo.
 */
export interface StatusComplianceAlert {
  /** Estado objetivo que la actividad deberia alcanzar dentro del plazo. */
  statusId: string;
  /** Dias desde la creacion de la actividad para alcanzar el estado objetivo. */
  daysFromCreation: number;
  /** Si `false`, la alerta no se evalua ni se envia. */
  enabled: boolean;
  /** A quien se envia el WhatsApp cuando la actividad incumple el plazo. */
  recipientType: WhatsappRecipientType;
  /** Usuario destinatario cuando `recipientType` = MEMBER. */
  recipientUserId?: string;
  /** Telefono destinatario cuando `recipientType` = PHONE. */
  recipientPhone?: string;
  /**
   * Texto del mensaje. Soporta variables `{{activityName}}`, `{{statusName}}`,
   * `{{projectName}}`, `{{daysFromCreation}}` y `{{link}}`.
   */
  message: string;
}

/** Nivel del semaforo de cumplimiento de una actividad. */
export enum ComplianceLevel {
  ON_TIME = 'ON_TIME',
  ATTENTION = 'ATTENTION',
  CRITICAL = 'CRITICAL',
}

/** Proyecto: define la estructura de sus actividades dentro de una organizacion. */
export interface Project {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  statuses: ProjectStatus[];
  customFields: ActivityCustomField[];
  rules: ProjectRule[];
  /** Semaforo de cumplimiento (deadline) configurable por el admin. */
  compliance?: ProjectCompliance;
  /**
   * Columnas ocultas en la tabla de actividades. Claves: 'name', 'status',
   * 'responsibles', 'createdAt', 'scheduledDate' o 'cf_<key>' para campos
   * personalizados. Configurable por ADMIN/SUPER_ADMIN; aplica a todos.
   */
  hiddenColumnKeys?: string[];
  /** Si `true`, un cambio de estado solo puede ir a un estado adyacente por `order`. */
  linearStatusFlow?: boolean;
  /**
   * Si `true`, en el detalle de la actividad se muestran TODOS los campos
   * (incluidos los que aun no cumplen sus condiciones de visibilidad), pero los
   * que no las cumplen aparecen bloqueados: se ven, no se pueden llenar hasta que
   * se cumplan sus reglas. Si es `false`/ausente (comportamiento por defecto) los
   * campos permanecen ocultos hasta que su visibilidad aplique.
   */
  alwaysShowFields?: boolean;
  /** Restricciones que deben cumplirse para permitir un cambio de estado. */
  transitionGuards?: StatusTransitionGuard[];
  isActive: boolean;
  isArchived: boolean;
  createdAt: IsoDate;
  updatedAt: IsoDate;
  createdBy?: string;
  updatedBy?: string;
}

/** Configuracion por defecto del semaforo (deshabilitado). */
export const DEFAULT_PROJECT_COMPLIANCE: ProjectCompliance = {
  enabled: false,
  defaultDurationDays: 3,
  attentionThresholdDays: 2,
  criticalThresholdDays: 0,
};

/** Estados base creados automaticamente cuando el Admin no define estados propios. */
export const DEFAULT_PROJECT_STATUSES: Omit<ProjectStatus, 'id'>[] = [
  {
    name: 'Para Hacer',
    type: StatusType.OPEN,
    order: 0,
    color: '#9CA3AF',
    isDefault: true,
    isActive: true,
    isArchived: false,
  },
  {
    name: 'En Proceso',
    type: StatusType.OPEN,
    order: 1,
    color: '#3B82F6',
    isDefault: false,
    isActive: true,
    isArchived: false,
  },
  {
    name: 'Finalizado',
    type: StatusType.CLOSED,
    order: 2,
    color: '#10B981',
    isDefault: false,
    isActive: true,
    isArchived: false,
  },
];
