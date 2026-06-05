import type { MessageTemplate, NotificationChannel } from '@gen-task/shared';
import { apiClient } from './client';

export const templatesApi = {
  list: (organizationId: string) =>
    apiClient.get<MessageTemplate[]>(
      `/organizations/${organizationId}/message-templates`,
    ),
  create: (
    organizationId: string,
    body: {
      key: string;
      name: string;
      body: string;
      channel?: NotificationChannel;
    },
  ) =>
    apiClient.post<MessageTemplate>(
      `/organizations/${organizationId}/message-templates`,
      body,
    ),
  update: (
    templateId: string,
    body: {
      name?: string;
      body?: string;
      channel?: NotificationChannel;
      isActive?: boolean;
    },
  ) => apiClient.patch<MessageTemplate>(`/message-templates/${templateId}`, body),
  remove: (templateId: string) =>
    apiClient.delete<void>(`/message-templates/${templateId}`),
};
