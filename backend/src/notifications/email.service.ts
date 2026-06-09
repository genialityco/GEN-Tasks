import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

/** Correo ya renderizado, listo para enviar. */
export interface OutboundEmail {
  to: string | string[];
  subject: string;
  /** Cuerpo en texto plano. Se envuelve en el layout HTML de la plataforma. */
  body: string;
}

/**
 * Envio de correo transaccional via Amazon SES.
 *
 * Es la implementacion real del canal EMAIL que {@link NotificationsService}
 * deja como punto de inyeccion. Se mantiene generico (no resuelve destinatarios
 * ni plantillas): recibe un correo ya renderizado y lo entrega.
 *
 * Configuracion por variables de entorno (todas opcionales en local):
 *   SES_FROM_EMAIL       remitente verificado en SES (obligatorio para enviar)
 *   AWS_REGION           region de SES (por defecto us-east-1)
 *   AWS_ACCESS_KEY_ID    credenciales IAM con permiso ses:SendEmail
 *   AWS_SECRET_ACCESS_KEY
 *
 * Si SES_FROM_EMAIL no esta definido, el servicio queda deshabilitado y los
 * envios se omiten con un log (no se rompe la operacion de negocio).
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly from: string;
  private readonly ses: SESClient;

  constructor(private readonly config: ConfigService) {
    this.from = this.config.get<string>('SES_FROM_EMAIL') ?? '';
    const region = this.config.get<string>('AWS_REGION') ?? 'us-east-1';
    this.ses = new SESClient({
      region,
      credentials: {
        accessKeyId: this.config.get<string>('AWS_ACCESS_KEY_ID') ?? '',
        secretAccessKey: this.config.get<string>('AWS_SECRET_ACCESS_KEY') ?? '',
      },
    });
    if (this.from) {
      this.logger.log(`SES inicializado — remitente: ${this.from}, region: ${region}`);
    } else {
      this.logger.warn(
        'SES_FROM_EMAIL no definido: el canal de email queda deshabilitado (los envios se omiten).',
      );
    }
  }

  /** Indica si el envio de correo esta habilitado (remitente configurado). */
  get isEnabled(): boolean {
    return Boolean(this.from);
  }

  /**
   * Envia un correo. Best effort: si SES no esta configurado o falla, registra
   * el problema y resuelve sin lanzar, para no romper el flujo que lo invoca.
   */
  async send(email: OutboundEmail): Promise<void> {
    const to = (Array.isArray(email.to) ? email.to : [email.to])
      .map((address) => address.trim())
      .filter(Boolean);

    if (!this.from) {
      this.logger.debug(`[email omitido] SES sin remitente. Asunto: ${email.subject}`);
      return;
    }
    if (to.length === 0) {
      this.logger.debug(`[email omitido] Sin destinatarios. Asunto: ${email.subject}`);
      return;
    }

    try {
      const result = await this.ses.send(
        new SendEmailCommand({
          Source: this.from,
          Destination: { ToAddresses: to },
          Message: {
            Subject: { Data: email.subject, Charset: 'UTF-8' },
            Body: {
              Html: { Data: wrapHtml(email.subject, email.body), Charset: 'UTF-8' },
              Text: { Data: email.body, Charset: 'UTF-8' },
            },
          },
        }),
      );
      this.logger.log(`SES acepto el mensaje a ${to.join(', ')} — MessageId=${result.MessageId}`);
    } catch (err) {
      this.logger.error(
        `SES rechazo el envio a ${to.join(', ')}: ${(err as Error).message}`,
      );
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Envuelve el cuerpo (texto plano) en el layout HTML de la plataforma. */
function wrapHtml(title: string, body: string): string {
  const bodyHtml = escapeHtml(body).replace(/\n/g, '<br/>');
  return `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff">
  <div style="background:#1a1a2e;padding:24px 32px">
    <h1 style="color:#fff;margin:0;font-size:20px">${escapeHtml(title)}</h1>
  </div>
  <div style="padding:24px 32px;color:#1a1a1a;font-size:14px;line-height:1.6">
    ${bodyHtml}
  </div>
</div>`;
}
