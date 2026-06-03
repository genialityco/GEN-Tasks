import type { Host } from '@gen-task/shared';
import { apiClient } from './client';

export const hostsApi = {
  listByOrg: (organizationId: string) =>
    apiClient.get<Host[]>(`/organizations/${organizationId}/hosts`),
};
