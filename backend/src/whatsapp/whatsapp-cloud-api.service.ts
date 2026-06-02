import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
}
