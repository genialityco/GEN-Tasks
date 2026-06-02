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
  isActive: boolean;
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
  isActive: boolean;
  isArchived: boolean;
  createdAt: IsoDate;
  updatedAt: IsoDate;
  createdBy?: string;
  updatedBy?: string;
}

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
