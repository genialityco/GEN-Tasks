import { IsoDate } from './common';
import { ActivitySource, UserRole } from '../enums';

/**
 * Archivo adjunto a un campo personalizado de tipo FILE / IMAGE / VIDEO. Se
 * almacena dentro de `customFieldValues[key]` como un arreglo de adjuntos.
 */
export interface ActivityFileAttachment {
  /** URL firmada de larga duracion para visualizar/descargar el archivo. */
  url: string;
  /** Ruta interna en Firebase Storage (segmentada por organizacion). */
  path: string;
  /** Nombre original del archivo subido. */
  name: string;
  /** Tipo MIME del archivo. */
  contentType: string;
  /** Tamano en bytes (si esta disponible). */
  size?: number;
  uploadedAt: IsoDate;
}

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

/** Tipo de evento registrado en el historial de una actividad. */
export enum ActivityHistoryType {
  STATUS_CHANGE = 'STATUS_CHANGE',
  FIELD_UPDATE = 'FIELD_UPDATE',
}

/** Detalle del cambio de un campo personalizado (para el historial). */
export interface ActivityFieldChange {
  /** Clave estable del campo. */
  fieldKey: string;
  /** Etiqueta legible del campo al momento del cambio. */
  fieldLabel: string;
  previousValue?: unknown;
  newValue?: unknown;
}

/**
 * Registro de historial de una actividad. Soporta cambios de estado
 * (`STATUS_CHANGE`) y ediciones de campos personalizados (`FIELD_UPDATE`).
 * Las entradas antiguas sin `type` se interpretan como cambios de estado.
 */
export interface ActivityStatusHistory {
  id: string;
  activityId: string;
  organizationId: string;
  projectId: string;
  /** Ausente en entradas heredadas; equivale a STATUS_CHANGE. */
  type?: ActivityHistoryType;
  previousStatusId?: string;
  /** Presente en cambios de estado. */
  newStatusId?: string;
  /** Presente en ediciones de campos personalizados. */
  fieldChanges?: ActivityFieldChange[];
  changedBy: string;
  changedByRole: UserRole;
  comment?: string;
  createdAt: IsoDate;
}
