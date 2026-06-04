import type { OrganizationMembership, User, UserRole } from '@gen-task/shared';
import { apiClient } from './client';

export const usersApi = {
  list: () => apiClient.get<User[]>('/users'),
  create: (body: {
    email: string;
    name: string;
    phone?: string;
    password?: string;
    isSuperAdmin?: boolean;
  }) => apiClient.post<User>('/users', body),
  update: (
    id: string,
    body: { name?: string; phone?: string; password?: string },
  ) => apiClient.patch<User>(`/users/${id}`, body),
  archive: (id: string) => apiClient.patch<User>(`/users/${id}/archive`),

  // Membresias
  createMembership: (body: {
    userId: string;
    organizationId: string;
    role: UserRole.ADMIN | UserRole.GESTOR;
    projectIds?: string[];
  }) => apiClient.post<OrganizationMembership>('/memberships', body),
  archiveMembership: (id: string) =>
    apiClient.patch<void>(`/memberships/${id}/archive`),
};
