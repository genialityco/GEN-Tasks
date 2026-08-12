import { Injectable } from '@nestjs/common';
import { WhatsappTemplateName } from '@gen-task/shared';
import { WhatsappService } from './whatsapp.service';

/**
 * Envio de notificaciones por WhatsApp usando plantillas de Meta Business
 * (Message Templates), en lugar de texto libre. Todas las plantillas estan
 * configuradas en espanol y deben existir/estar aprobadas en el WhatsApp
 * Manager con el nombre exacto indicado en `WhatsappTemplateName`.
 *
 * Ofrece dos modos de uso:
 *  1) Un metodo dedicado por plantilla (mas claro en los call sites).
 *  2) `sendByTemplateName`, generico por nombre + parametros posicionales,
 *     usado por el motor de reglas para que un admin elija la plantilla desde
 *     la configuracion del proyecto.
 */
@Injectable()
export class WhatsappTemplatesService {
  constructor(private readonly whatsapp: WhatsappService) {}

  /**
   * Plantilla generica `notificacion_actividad_utilidad`.
   * {{1}} nombre del destinatario, {{2}} mensaje libre.
   * Mayor riesgo de rechazo/baja calidad en Meta por ser muy libre: usar solo
   * cuando ninguna plantilla especifica aplica.
   */
  sendNotificacionActividadUtilidad(
    organizationId: string,
    phone: string,
    nombre: string,
    mensaje: string,
  ): Promise<void> {
    return this.whatsapp.sendTemplateMessageToPhone(
      organizationId,
      phone,
      WhatsappTemplateName.NOTIFICACION_ACTIVIDAD_UTILIDAD,
      [nombre, mensaje],
    );
  }

  /** Plantilla `actividad_insumo_cargado`: {{1}} nombre, {{2}} actividad, {{3}} proyecto. */
  sendInsumoCargado(
    organizationId: string,
    phone: string,
    nombre: string,
    actividad: string,
    proyecto: string,
  ): Promise<void> {
    return this.whatsapp.sendTemplateMessageToPhone(
      organizationId,
      phone,
      WhatsappTemplateName.ACTIVIDAD_INSUMO_CARGADO,
      [nombre, actividad, proyecto],
    );
  }

  /** Plantilla `actividad_aprobacion_piezas`: {{1}} nombre, {{2}} actividad. */
  sendAprobacionPiezas(
    organizationId: string,
    phone: string,
    nombre: string,
    actividad: string,
  ): Promise<void> {
    return this.whatsapp.sendTemplateMessageToPhone(
      organizationId,
      phone,
      WhatsappTemplateName.ACTIVIDAD_APROBACION_PIEZAS,
      [nombre, actividad],
    );
  }

  /** Plantilla `actividad_en_montaje`: {{1}} nombre, {{2}} actividad. */
  sendEnMontaje(
    organizationId: string,
    phone: string,
    nombre: string,
    actividad: string,
  ): Promise<void> {
    return this.whatsapp.sendTemplateMessageToPhone(
      organizationId,
      phone,
      WhatsappTemplateName.ACTIVIDAD_EN_MONTAJE,
      [nombre, actividad],
    );
  }

  /** Plantilla `actividad_enlace_publicado`: {{1}} nombre, {{2}} actividad. */
  sendEnlacePublicado(
    organizationId: string,
    phone: string,
    nombre: string,
    actividad: string,
  ): Promise<void> {
    return this.whatsapp.sendTemplateMessageToPhone(
      organizationId,
      phone,
      WhatsappTemplateName.ACTIVIDAD_ENLACE_PUBLICADO,
      [nombre, actividad],
    );
  }

  /** Plantilla `actividad_informe_disponible`: {{1}} nombre, {{2}} actividad. */
  sendInformeDisponible(
    organizationId: string,
    phone: string,
    nombre: string,
    actividad: string,
  ): Promise<void> {
    return this.whatsapp.sendTemplateMessageToPhone(
      organizationId,
      phone,
      WhatsappTemplateName.ACTIVIDAD_INFORME_DISPONIBLE,
      [nombre, actividad],
    );
  }

  /**
   * Envio generico por nombre de plantilla + parametros posicionales ya
   * resueltos. Usado por el motor de reglas (accion SEND_WHATSAPP en modo
   * plantilla), donde la plantilla la elige el admin desde la configuracion
   * del proyecto.
   */
  sendByTemplateName(
    organizationId: string,
    phone: string,
    templateName: WhatsappTemplateName,
    params: string[],
  ): Promise<void> {
    return this.whatsapp.sendTemplateMessageToPhone(
      organizationId,
      phone,
      templateName,
      params,
    );
  }
}
