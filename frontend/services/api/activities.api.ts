import type {
  Activity,
  ActivityFileAttachment,
  ActivityStatusHistory,
} from '@gen-task/shared';
import { apiClient, uploadFile } from './client';

export interface ActivityFilters {
  statusId?: string;
  responsibleId?: string;
  search?: string;
  includeArchived?: boolean;
}

/**
 * `JSON.stringify` descarta las claves cuyo valor es `undefined`. Eso impedia
 * vaciar un campo personalizado: el backend nunca recibia la clave y, al hacer
 * merge con los valores previos, conservaba el valor anterior (ej.: los archivos
 * "borrados" reaparecian al recargar). Se convierten a `null` para que el
 * vaciado viaje y el backend lo persista.
 */
function normalizeUpdateBody(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const cfv = body.customFieldValues;
  if (!cfv || typeof cfv !== 'object' || Array.isArray(cfv)) return body;
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(cfv as Record<string, unknown>)) {
    normalized[key] = value === undefined ? null : value;
  }
  return { ...body, customFieldValues: normalized };
}

function toQuery(filters?: ActivityFilters): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.statusId) params.set('statusId', filters.statusId);
  if (filters.responsibleId) params.set('responsibleId', filters.responsibleId);
  if (filters.search) params.set('search', filters.search);
  if (filters.includeArchived) params.set('includeArchived', 'true');
  const q = params.toString();
  return q ? `?${q}` : '';
}

export const activitiesApi = {
  listByProject: (projectId: string, filters?: ActivityFilters) =>
    apiClient.get<Activity[]>(
      `/projects/${projectId}/activities${toQuery(filters)}`,
    ),
  get: (activityId: string) =>
    apiClient.get<Activity>(`/activities/${activityId}`),
  create: (projectId: string, body: Record<string, unknown>) =>
    apiClient.post<Activity>(`/projects/${projectId}/activities`, body),
  update: (activityId: string, body: Record<string, unknown>) =>
    apiClient.patch<Activity>(`/activities/${activityId}`, normalizeUpdateBody(body)),
  changeStatus: (activityId: string, statusId: string, comment?: string) =>
    apiClient.patch<Activity>(`/activities/${activityId}/status`, {
      statusId,
      comment,
    }),
  archive: (activityId: string) =>
    apiClient.patch<Activity>(`/activities/${activityId}/archive`),
  history: (activityId: string) =>
    apiClient.get<ActivityStatusHistory[]>(
      `/activities/${activityId}/history`,
    ),
  /** Sube un archivo (campo FILE/IMAGE/VIDEO) y devuelve el adjunto resultante. */
  uploadAttachment: (projectId: string, file: File) =>
    uploadFile<ActivityFileAttachment>(
      `/projects/${projectId}/uploads`,
      file,
    ),
  /** Importa actividades desde filas de Excel ya parseadas. */
  importActivities: (
    projectId: string,
    rows: Array<Record<string, string>>,
  ) =>
    apiClient.post<{
      created: Array<{ row: number; name: string; id: string }>;
      failed: Array<{ row: number; reason: string }>;
    }>(`/projects/${projectId}/activities/import`, { rows }),
  /** Exporta las actividades visibles del proyecto como matriz tabular. */
  exportActivities: (projectId: string, filters?: ActivityFilters) =>
    apiClient.get<{
      columns: string[];
      rows: Array<Record<string, string>>;
    }>(`/projects/${projectId}/activities/export${toQuery(filters)}`),
};
