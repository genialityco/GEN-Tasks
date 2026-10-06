import type {
  WhatsappChat,
  WhatsappGroup,
  WhatsappGroupJoinApprovalMode,
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

/** Datos para crear un grupo de WhatsApp (Groups API de Meta). */
export interface CreateWhatsappGroupPayload {
  subject: string;
  description?: string;
  joinApprovalMode?: WhatsappGroupJoinApprovalMode;
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
  listGroups: (organizationId: string) =>
    apiClient.get<WhatsappGroup[]>(
      `/organizations/${organizationId}/whatsapp/groups`,
    ),
  createGroup: (organizationId: string, payload: CreateWhatsappGroupPayload) =>
    apiClient.post<WhatsappGroup>(
      `/organizations/${organizationId}/whatsapp/groups`,
      payload,
    ),
  resetGroupInviteLink: (organizationId: string, groupId: string) =>
    apiClient.post<WhatsappGroup>(
      `/organizations/${organizationId}/whatsapp/groups/${groupId}/invite-link/reset`,
    ),
  sendGroupMessage: (organizationId: string, groupId: string, body: string) =>
    apiClient.post<{ sent: true }>(
      `/organizations/${organizationId}/whatsapp/groups/${groupId}/messages`,
      { body },
    ),
  deleteGroup: (organizationId: string, groupId: string) =>
    apiClient.delete<{ deleted: true }>(
      `/organizations/${organizationId}/whatsapp/groups/${groupId}`,
    ),
};
