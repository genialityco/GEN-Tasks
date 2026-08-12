import { WhatsappTemplateName } from '@gen-task/shared';

/**
 * Renderiza el texto equivalente de una plantilla Meta ya con sus parametros
 * reemplazados. Meta no devuelve el cuerpo renderizado al enviar un mensaje de
 * plantilla, asi que este texto es el que se persiste en `whatsapp_messages`
 * para que el chat siga siendo legible en el panel. Debe reflejar exactamente
 * el contenido aprobado de cada plantilla (ver `WhatsappTemplateName`).
 */
type TemplateFallbackRenderer = (params: string[]) => string;

const WHATSAPP_TEMPLATE_FALLBACKS: Record<
  WhatsappTemplateName,
  TemplateFallbackRenderer
> = {
  [WhatsappTemplateName.NOTIFICACION_ACTIVIDAD_UTILIDAD]: ([nombre, mensaje]) =>
    `Hola ${nombre},\n\nLe notificamos que:\n${mensaje}\n\nGracias.`,

  [WhatsappTemplateName.ACTIVIDAD_INSUMO_CARGADO]: ([nombre, actividad, proyecto]) =>
    `Hola ${nombre},\n\n` +
    `Se cargó el insumo material gráfico de *${actividad}*.\n` +
    `Proyecto: ${proyecto}.\n\n` +
    `Puedes revisarlo en la plataforma.`,

  [WhatsappTemplateName.ACTIVIDAD_APROBACION_PIEZAS]: ([nombre, actividad]) =>
    `Hola ${nombre},\n\n` +
    `✅ La actividad *${actividad}* pasó a *Aprobación de Piezas*.\n\n` +
    `Por favor revisa y aprueba las piezas gráficas.`,

  [WhatsappTemplateName.ACTIVIDAD_EN_MONTAJE]: ([nombre, actividad]) =>
    `Hola ${nombre},\n\n` +
    `🔧 La actividad *${actividad}* está en *En Montaje*.\n\n` +
    `Por favor carga el enlace de estudio y el enlace del evento.`,

  [WhatsappTemplateName.ACTIVIDAD_ENLACE_PUBLICADO]: ([nombre, actividad]) =>
    `Hola ${nombre},\n\n` +
    `🌐 La actividad *${actividad}* pasó a *Enlace Publicado*.\n\n` +
    `El enlace del evento ya está disponible.`,

  [WhatsappTemplateName.ACTIVIDAD_INFORME_DISPONIBLE]: ([nombre, actividad]) =>
    `Hola ${nombre},\n\n` +
    `📊 El informe de *${actividad}* ya está disponible.\n\n` +
    `Puedes revisar el link de informe en la plataforma.`,
};

/** Cuantos parametros posicionales ({{1}}, {{2}}, ...) espera cada plantilla. */
export const WHATSAPP_TEMPLATE_PARAM_COUNT: Record<WhatsappTemplateName, number> = {
  [WhatsappTemplateName.NOTIFICACION_ACTIVIDAD_UTILIDAD]: 2,
  [WhatsappTemplateName.ACTIVIDAD_INSUMO_CARGADO]: 3,
  [WhatsappTemplateName.ACTIVIDAD_APROBACION_PIEZAS]: 2,
  [WhatsappTemplateName.ACTIVIDAD_EN_MONTAJE]: 2,
  [WhatsappTemplateName.ACTIVIDAD_ENLACE_PUBLICADO]: 2,
  [WhatsappTemplateName.ACTIVIDAD_INFORME_DISPONIBLE]: 2,
};

/** Construye el texto legible (para el historial del chat) de un envio de plantilla. */
export function renderWhatsappTemplateFallback(
  templateName: WhatsappTemplateName,
  params: string[],
): string {
  const renderer = WHATSAPP_TEMPLATE_FALLBACKS[templateName];
  return renderer ? renderer(params) : params.join(' | ');
}
