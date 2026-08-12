import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Los parametros `{{n}}` de una plantilla Meta no admiten saltos de linea,
 * tabs ni mas de 4 espacios seguidos (error 132018); esa restriccion solo
 * aplica a los valores insertados, no al cuerpo aprobado de la plantilla. Se
 * normaliza aqui para que cualquier mensaje libre (p. ej. multilinea, escrito
 * en un Textarea) sea valido como parametro de plantilla.
 */
function sanitizeTemplateParam(text: string): string {
  return text.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
}

/**
 * Cliente del WhatsApp Cloud API. Centraliza el envio de mensajes salientes.
 * En la primera version se usa un unico phoneNumberId/token a nivel plataforma;
 * la firma admite override por organizacion para el soporte multi-numero futuro.
 */
@Injectable()
export class WhatsappCloudApiService {
  private readonly logger = new Logger(WhatsappCloudApiService.name);

  constructor(private readonly config: ConfigService) {}

  private get apiVersion(): string {
    return this.config.get<string>('WHATSAPP_API_VERSION') ?? 'v21.0';
  }

  /** Codigo de idioma con el que las plantillas fueron aprobadas en Meta. */
  get defaultTemplateLanguage(): string {
    return this.config.get<string>('WHATSAPP_TEMPLATE_LANGUAGE') ?? 'es';
  }

  /** Envia un mensaje de texto al numero indicado. Devuelve el id del mensaje. */
  async sendText(params: {
    to: string;
    body: string;
    phoneNumberId?: string;
    accessToken?: string;
  }): Promise<string | null> {
    const phoneNumberId =
      params.phoneNumberId ??
      this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    const accessToken =
      params.accessToken ?? this.config.get<string>('WHATSAPP_ACCESS_TOKEN');

    if (!phoneNumberId || !accessToken) {
      this.logger.warn(
        'WhatsApp no configurado (phoneNumberId/accessToken ausentes). Mensaje no enviado.',
      );
      return null;
    }

    const url = `https://graph.facebook.com/${this.apiVersion}/${phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: params.to,
        type: 'text',
        text: { body: params.body },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Error enviando mensaje WhatsApp: ${res.status} ${text}`);
      return null;
    }

    const data = (await res.json()) as {
      messages?: { id: string }[];
    };
    return data.messages?.[0]?.id ?? null;
  }

  /**
   * Envia un mensaje de PLANTILLA (Meta Business Message Templates) al numero
   * indicado, con parametros posicionales de texto para el cuerpo ({{1}},
   * {{2}}, ...). La plantilla debe existir y estar aprobada en el WhatsApp
   * Manager con el nombre e idioma indicados. Devuelve el id del mensaje.
   */
  async sendTemplate(params: {
    to: string;
    templateName: string;
    /** Parametros posicionales del cuerpo, en orden ({{1}}, {{2}}, ...). */
    bodyParams: string[];
    languageCode?: string;
    phoneNumberId?: string;
    accessToken?: string;
  }): Promise<string | null> {
    const phoneNumberId =
      params.phoneNumberId ??
      this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    const accessToken =
      params.accessToken ?? this.config.get<string>('WHATSAPP_ACCESS_TOKEN');

    if (!phoneNumberId || !accessToken) {
      this.logger.warn(
        'WhatsApp no configurado (phoneNumberId/accessToken ausentes). Plantilla no enviada.',
      );
      return null;
    }

    const url = `https://graph.facebook.com/${this.apiVersion}/${phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: params.to,
        type: 'template',
        template: {
          name: params.templateName,
          language: { code: params.languageCode ?? this.defaultTemplateLanguage },
          components: params.bodyParams.length
            ? [
                {
                  type: 'body',
                  parameters: params.bodyParams.map((text) => ({
                    type: 'text',
                    text: sanitizeTemplateParam(text),
                  })),
                },
              ]
            : undefined,
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(
        `Error enviando plantilla WhatsApp "${params.templateName}": ${res.status} ${text}`,
      );
      return null;
    }

    const data = (await res.json()) as {
      messages?: { id: string }[];
    };
    return data.messages?.[0]?.id ?? null;
  }
}
