import type {
  ActivityCustomField,
  Project,
  ProjectStatus,
} from '@gen-task/shared';
import { apiClient } from './client';

export const projectsApi = {
  listByOrg: (organizationId: string) =>
    apiClient.get<Project[]>(`/organizations/${organizationId}/projects`),
  get: (projectId: string) =>
    apiClient.get<Project>(`/projects/${projectId}`),
  create: (organizationId: string, body: { name: string; description?: string }) =>
    apiClient.post<Project>(`/organizations/${organizationId}/projects`, body),
  update: (projectId: string, body: { name?: string; description?: string }) =>
    apiClient.patch<Project>(`/projects/${projectId}`, body),
  archive: (projectId: string) =>
    apiClient.patch<Project>(`/projects/${projectId}/archive`),

  // Estados
  listStatuses: (projectId: string) =>
    apiClient.get<ProjectStatus[]>(`/projects/${projectId}/statuses`),
  createStatus: (projectId: string, body: Record<string, unknown>) =>
    apiClient.post<ProjectStatus>(`/projects/${projectId}/statuses`, body),

  // Campos personalizados
  listCustomFields: (projectId: string) =>
    apiClient.get<ActivityCustomField[]>(`/projects/${projectId}/custom-fields`),
  createCustomField: (projectId: string, body: Record<string, unknown>) =>
    apiClient.post<ActivityCustomField>(
      `/projects/${projectId}/custom-fields`,
      body,
    ),
};
