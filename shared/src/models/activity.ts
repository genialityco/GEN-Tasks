import { IsoDate } from './common';
import { ActivitySource, UserRole } from '../enums';

/**
 * Actividad: elemento operativo principal. Pertenece a un proyecto y a una
 * organizacion. Nunca se elimina fisicamente; se archiva (isArchived).
 */
export interface Activity {
  id: string;
  organizationId: string;
  projectId: string;
  name: string;
  statusId: string;
  scheduledDate?: IsoDate;
  /** Puede estar vacio (actividad sin responsable) o tener uno o varios. */
  responsibleIds: string[];
  /** Valores de campos personalizados, indexados por la `key` del campo. */
  customFieldValues: Record<string, unknown>;
  source: ActivitySource;
  createdBy?: string;
  /** Presente cuando la actividad fue creada por un Host desde WhatsApp. */
  hostId?: string;
  isArchived: boolean;
  createdAt: IsoDate;
  updatedAt: IsoDate;
  updatedBy?: string;
}

/**
 * Registro de historial de cambio de estado de una actividad.
 * La arquitectura permite extenderlo a otros tipos de cambio en el futuro.
 */
export interface ActivityStatusHistory {
  id: string;
  activityId: string;
  organizationId: string;
  projectId: string;
  previousStatusId?: string;
  newStatusId: string;
  changedBy: string;
  changedByRole: UserRole;
  comment?: string;
  createdAt: IsoDate;
}
