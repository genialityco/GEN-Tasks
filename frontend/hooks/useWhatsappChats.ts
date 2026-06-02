'use client';

import { whatsappApi } from '../services/api/whatsapp.api';
import { useAsync } from './useAsync';

/** Conversaciones de WhatsApp de una organizacion. */
export function useWhatsappChats(organizationId: string) {
  return useAsync(
    () => whatsappApi.listChats(organizationId),
    [organizationId],
  );
}

/** Mensajes de un chat. */
export function useWhatsappMessages(chatId: string | null) {
  return useAsync(
    () => (chatId ? whatsappApi.listMessages(chatId) : Promise.resolve([])),
    [chatId],
  );
}
