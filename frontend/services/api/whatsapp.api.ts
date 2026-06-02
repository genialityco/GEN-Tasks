import type { WhatsappChat, WhatsappMessage } from '@gen-task/shared';
import { apiClient } from './client';

export const whatsappApi = {
  listChats: (organizationId: string) =>
    apiClient.get<WhatsappChat[]>(
      `/organizations/${organizationId}/whatsapp/chats`,
    ),
  listMessages: (chatId: string) =>
    apiClient.get<WhatsappMessage[]>(`/whatsapp/chats/${chatId}/messages`),
  sendMessage: (chatId: string, body: string) =>
    apiClient.post<WhatsappMessage>(`/whatsapp/chats/${chatId}/messages`, {
      body,
    }),
  toggleBot: (chatId: string, botEnabled: boolean) =>
    apiClient.patch<WhatsappChat>(`/whatsapp/chats/${chatId}/bot-toggle`, {
      botEnabled,
    }),
  requestInfo: (chatId: string, body: string) =>
    apiClient.post<WhatsappMessage>(`/whatsapp/chats/${chatId}/request-info`, {
      body,
    }),
};
