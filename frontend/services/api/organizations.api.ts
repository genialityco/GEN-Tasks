import type {
  Organization,
  OrganizationFeatures,
  OrganizationMember,
} from '@gen-task/shared';
import { apiClient } from './client';

export const organizationsApi = {
  list: () => apiClient.get<Organization[]>('/organizations'),
  get: (id: string) => apiClient.get<Organization>(`/organizations/${id}`),
  members: (id: string) =>
    apiClient.get<OrganizationMember[]>(`/organizations/${id}/members`),
  create: (body: { name: string; admins?: string[] }) =>
    apiClient.post<Organization>('/organizations', body),
  update: (id: string, body: { name?: string; admins?: string[] }) =>
    apiClient.patch<Organization>(`/organizations/${id}`, body),
  archive: (id: string) =>
    apiClient.patch<Organization>(`/organizations/${id}/archive`),
  updateFeatures: (id: string, features: Partial<OrganizationFeatures>) =>
    apiClient.patch<Organization>(`/organizations/${id}/features`, { features }),
  assignAdmin: (
    id: string,
    body: { email: string; name: string; phone?: string; password?: string },
  ) => apiClient.post(`/organizations/${id}/admins`, body),
  removeAdmin: (id: string, userId: string) =>
    apiClient.delete<Organization>(`/organizations/${id}/admins/${userId}`),
};
