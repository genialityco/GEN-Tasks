import type { Activity, ActivityStatusHistory } from '@gen-task/shared';
import { apiClient } from './client';

export interface ActivityFilters {
  statusId?: string;
  responsibleId?: string;
  search?: string;
  includeArchived?: boolean;
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
    apiClient.patch<Activity>(`/activities/${activityId}`, body),
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
};
