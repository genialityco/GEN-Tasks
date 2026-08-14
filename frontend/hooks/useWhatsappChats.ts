'use client';

import { useEffect } from 'react';
import { whatsappApi } from '../services/api/whatsapp.api';
import { useAsync } from './useAsync';

const MESSAGES_POLL_MS = 5000;
const CHATS_POLL_MS = 8000;

/**
 * Conversaciones de WhatsApp de una organizacion, con polling para que los
 * chats nuevos (o cambios de estado del bot) aparezcan sin recargar la pagina.
 * `useAsync` conserva los datos previos mientras recarga, asi que la lista no
 * parpadea ni desaparece entre sondeos.
 */
export function useWhatsappChats(organizationId: string) {
  const state = useAsync(
    () => whatsappApi.listChats(organizationId),
    [organizationId],
  );

  useEffect(() => {
    if (!organizationId) return;
    const id = setInterval(() => state.reload(), CHATS_POLL_MS);
    return () => clearInterval(id);
    // reload es estable (useCallback); organizationId es la dependencia real.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  return state;
}

/**
 * Mensajes de un chat con polling cada 5 s para reflejar mensajes entrantes
 * sin necesidad de recargar manualmente.
 */
export function useWhatsappMessages(chatId: string | null) {
  const state = useAsync(
    () => (chatId ? whatsappApi.listMessages(chatId) : Promise.resolve([])),
    [chatId],
  );

  useEffect(() => {
    if (!chatId) return;
    const id = setInterval(() => state.reload(), MESSAGES_POLL_MS);
    return () => clearInterval(id);
  // reload es estable (useCallback), chatId es la dependencia real
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  return state;
}
