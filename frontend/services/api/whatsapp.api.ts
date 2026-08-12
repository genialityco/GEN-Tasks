import type {
  WhatsappChat,
  WhatsappMessage,
  WhatsappTemplateName,
} from '@gen-task/shared';
import { apiClient } from './client';

/** Cuerpo de un envio de prueba: texto libre (`body`) o plantilla Meta. */
export interface SendTestMessagePayload {
  phone: string;
  body?: string;
  templateName?: WhatsappTemplateName;
  templateParams?: string[];
}

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
  sendTestMessage: (organizationId: string, payload: SendTestMessagePayload) =>
    apiClient.post<{ sent: true }>(
      `/organizations/${organizationId}/whatsapp/test-message`,
      payload,
    ),
};
