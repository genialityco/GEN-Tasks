import { IsoDate } from './common';
import { LogicalOperator } from '../enums';
import { RuleCondition } from './project';

/** Transicion de estado permitida para un gestor. */
export interface AllowedStatusTransition {
  fromStatusId: string;
  toStatusId: string;
}

/**
 * Regla de acceso de un gestor sobre un proyecto.
 *
 * Cumple dos funciones:
 * 1. Filtrar que actividades puede ver el gestor (segun `conditions`).
 * 2. Definir valores por defecto al crear actividades: si una condicion es
 *    EQUALS sobre un campo, ese campo se autocompleta con ese valor.
 *
 * Tambien limita las transiciones de estado permitidas. Si
 * `allowAnyStatusTransition` es true, el gestor puede cambiar a cualquier estado.
 */
export interface GestorAccessRule {
  id: string;
  organizationId: string;
  projectId: string;
  gestorId: string;
  conditions: RuleCondition[];
  logicalOperator: LogicalOperator;
  allowedStatusTransitions?: AllowedStatusTransition[];
  allowAnyStatusTransition?: boolean;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}
