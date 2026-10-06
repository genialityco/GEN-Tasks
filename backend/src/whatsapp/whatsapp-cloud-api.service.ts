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

  // ----------------------------------------------------------------------
  // Groups API (requiere Official Business Account)
  // ----------------------------------------------------------------------

  /**
   * Hace una peticion a la Graph API y lanza un Error con el mensaje de Meta
   * si falla. A diferencia del envio de mensajes (best-effort), la gestion de
   * grupos la dispara un usuario desde el panel y debe ver el error.
   */
  private async graphRequest<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const accessToken = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');
    if (!accessToken) {
      throw new Error('WhatsApp no configurado (WHATSAPP_ACCESS_TOKEN ausente).');
    }
    const res = await fetch(
      `https://graph.facebook.com/${this.apiVersion}/${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    const text = await res.text();
    if (!res.ok) {
      this.logger.error(`Error Graph API ${method} ${path}: ${res.status} ${text}`);
      let message = `Error ${res.status} de Meta`;
      try {
        const parsed = JSON.parse(text) as {
          error?: { message?: string; error_data?: { details?: string } };
        };
        message =
          parsed.error?.error_data?.details ?? parsed.error?.message ?? message;
      } catch {
        // respuesta no JSON: se conserva el mensaje generico
      }
      throw new Error(message);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  /**
   * Solicita la creacion de un grupo. Es asincrona: devuelve el `request_id`
   * y el `group_id` + `invite_link` llegan por el webhook
   * `group_lifecycle_update`.
   */
  async createGroup(params: {
    subject: string;
    description?: string;
    joinApprovalMode?: 'auto_approve' | 'approval_required';
  }): Promise<{ requestId: string }> {
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    if (!phoneNumberId) {
      throw new Error('WhatsApp no configurado (WHATSAPP_PHONE_NUMBER_ID ausente).');
    }
    const data = await this.graphRequest<{ request_id?: string }>(
      'POST',
      `${phoneNumberId}/groups`,
      {
        messaging_product: 'whatsapp',
        subject: params.subject,
        description: params.description || undefined,
        join_approval_mode: params.joinApprovalMode ?? 'auto_approve',
      },
    );
    if (!data.request_id) {
      throw new Error('Meta no devolvio request_id al crear el grupo.');
    }
    return { requestId: data.request_id };
  }

  /** Obtiene el enlace de invitacion vigente del grupo. */
  async getGroupInviteLink(groupId: string): Promise<string> {
    const data = await this.graphRequest<{ invite_link: string }>(
      'GET',
      `${groupId}/invite_link`,
    );
    return data.invite_link;
  }

  /** Revoca el enlace actual y genera uno nuevo. */
  async resetGroupInviteLink(groupId: string): Promise<string> {
    const data = await this.graphRequest<{ invite_link: string }>(
      'POST',
      `${groupId}/invite_link`,
      { messaging_product: 'whatsapp' },
    );
    return data.invite_link;
  }

  /** Elimina el grupo y saca a todos los participantes (incluido el negocio). */
  async deleteGroup(groupId: string): Promise<void> {
    await this.graphRequest('DELETE', groupId);
  }

  /** Envia un mensaje de texto a un grupo. Devuelve el id del mensaje. */
  async sendGroupText(groupId: string, body: string): Promise<string | null> {
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    if (!phoneNumberId) {
      throw new Error('WhatsApp no configurado (WHATSAPP_PHONE_NUMBER_ID ausente).');
    }
    const data = await this.graphRequest<{ messages?: { id: string }[] }>(
      'POST',
      `${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'group',
        to: groupId,
        type: 'text',
        text: { body },
      },
    );
    return data.messages?.[0]?.id ?? null;
  }
}
