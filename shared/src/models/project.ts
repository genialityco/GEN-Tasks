import { IsoDate } from './common';
import {
  CustomFieldType,
  LogicalOperator,
  RuleActionType,
  RuleEvent,
  StatusType,
  UserRole,
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
