import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AuthenticatedUser,
  MessageType,
  UserRole,
  WhatsappProvider,
} from '@gen-task/shared';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { OrganizationAccessGuard } from '../common/guards/organization-access.guard';
import { normalizePhoneForWhatsApp } from '../common/phone';
import {
  NormalizedInboundMessage,
  WhatsappService,
} from './whatsapp.service';
import { WhatsappTemplatesService } from './whatsapp-templates.service';
import {
  GroupWebhookEvent,
  WhatsappGroupsService,
} from './whatsapp-groups.service';
import { WhatsappWebService } from './whatsapp-web.service';
import { renderWhatsappTemplateFallback } from './whatsapp-templates.constants';
import {
  ConnectWebSessionDto,
  CreateWhatsappGroupDto,
  RequestInfoDto,
  SendMessageDto,
  SendTestMessageDto,
  SendWebGroupMessageDto,
  ToggleBotDto,
} from './dto/whatsapp.dto';

/**
 * Webhook de WhatsApp (publico) + endpoints del panel de Chat WhatsApp
 * (protegidos por rol y acceso a organizacion).
 */
@Controller()
export class WhatsappController {
  constructor(
    private readonly whatsapp: WhatsappService,
    private readonly whatsappTemplates: WhatsappTemplatesService,
    private readonly whatsappGroups: WhatsappGroupsService,
    private readonly whatsappWeb: WhatsappWebService,
    private readonly config: ConfigService,
  ) {}

  // ----------------------------------------------------------------------
  // Webhook (publico, sin auth)
  // ----------------------------------------------------------------------

  /** Verificacion del webhook (Meta envia hub.challenge). */
  @Public()
  @Get('whatsapp/webhook')
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    const expected = this.config.get<string>('WHATSAPP_VERIFY_TOKEN');
    if (mode === 'subscribe' && token === expected) {
      return challenge;
    }
    throw new BadRequestException('Verificacion de webhook fallida.');
  }

  /** Recepcion de eventos entrantes de WhatsApp. */
  @Public()
  @Post('whatsapp/webhook')
  async receive(@Body() payload: unknown): Promise<{ received: true }> {
    for (const message of this.parsePayload(payload)) {
      await this.whatsapp.handleInbound(message);
    }
    for (const event of this.parseGroupEvents(payload)) {
      await this.whatsappGroups.handleWebhookEvent(event);
    }
    // Meta espera 200 OK siempre para no reintentar.
    return { received: true };
  }

  // ----------------------------------------------------------------------
  // Panel: chats y mensajes (protegido)
  // ----------------------------------------------------------------------

  @Get('organizations/:organizationId/whatsapp/chats')
  @UseGuards(RolesGuard, OrganizationAccessGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  listChats(@Param('organizationId') organizationId: string) {
    return this.whatsapp.listChats(organizationId);
  }

  /**
   * Envia un mensaje de prueba (texto libre o plantilla Meta) a un telefono
   * arbitrario o a un grupo (`groupId`), por el proveedor elegido. Usado por
   * el formulario de automatizaciones para verificar, antes de guardar la
   * regla, que el mensaje/plantilla configurado realmente se entrega.
   */
  @Post('organizations/:organizationId/whatsapp/test-message')
  @UseGuards(RolesGuard, OrganizationAccessGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async sendTestMessage(
    @Param('organizationId') organizationId: string,
    @Body() dto: SendTestMessageDto,
  ): Promise<{ sent: true }> {
    const provider = dto.provider ?? WhatsappProvider.CLOUD_API;
    if (dto.groupId) {
      // A los grupos se envia texto: con plantilla, su texto equivalente.
      const body = dto.templateName
        ? renderWhatsappTemplateFallback(dto.templateName, dto.templateParams ?? [])
        : dto.body?.trim();
      if (!body) {
        throw new BadRequestException('Falta el mensaje a enviar.');
      }
      return this.whatsappGroups.sendMessageVia(
        organizationId,
        provider,
        dto.groupId,
        body,
      );
    }
    const phone = normalizePhoneForWhatsApp(dto.phone);
    if (!phone) {
      throw new BadRequestException('Telefono invalido.');
    }
    if (dto.templateName) {
      await this.whatsappTemplates.sendByTemplateName(
        organizationId,
        phone,
        dto.templateName,
        dto.templateParams ?? [],
        provider,
      );
    } else {
      if (!dto.body?.trim()) {
        throw new BadRequestException('Falta el mensaje a enviar.');
      }
      await this.whatsapp.sendBotMessageToPhone(
        organizationId,
        phone,
        dto.body,
        provider,
      );
    }
    return { sent: true };
  }

  // ----------------------------------------------------------------------
  // Panel: WhatsApp Web (libreria no oficial, numero vinculado por QR)
  // ----------------------------------------------------------------------

  @Get('organizations/:organizationId/whatsapp/web/session')
  @UseGuards(RolesGuard, OrganizationAccessGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getWebSession(@Param('organizationId') organizationId: string) {
    return this.whatsappWeb.getStatus(organizationId);
  }

  /**
   * Inicia la conexion; si no hay sesion guardada, el estado pasa a QR. Con
   * `phone` se vincula por codigo de 8 caracteres en lugar de QR.
   */
  @Post('organizations/:organizationId/whatsapp/web/session/connect')
  @UseGuards(RolesGuard, OrganizationAccessGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  connectWebSession(
    @Param('organizationId') organizationId: string,
    @Body() dto: ConnectWebSessionDto,
  ) {
    return this.whatsappWeb.connect(organizationId, dto.phone);
  }

  /** Desvincula el numero (cierra sesion en WhatsApp y borra credenciales). */
  @Delete('organizations/:organizationId/whatsapp/web/session')
  @UseGuards(RolesGuard, OrganizationAccessGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  disconnectWebSession(@Param('organizationId') organizationId: string) {
    return this.whatsappWeb.disconnect(organizationId);
  }

  @Get('organizations/:organizationId/whatsapp/web/groups')
  @UseGuards(RolesGuard, OrganizationAccessGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  listWebGroups(@Param('organizationId') organizationId: string) {
    return this.whatsappWeb.listGroups(organizationId);
  }

  @Post('organizations/:organizationId/whatsapp/web/groups/messages')
  @UseGuards(RolesGuard, OrganizationAccessGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async sendWebGroupMessage(
    @Param('organizationId') organizationId: string,
    @Body() dto: SendWebGroupMessageDto,
  ): Promise<{ sent: true }> {
    await this.whatsappWeb.sendToGroup(organizationId, dto.groupId, dto.body);
    return { sent: true };
  }

  // ----------------------------------------------------------------------
  // Panel: grupos de WhatsApp (Groups API)
  // ----------------------------------------------------------------------

  @Get('organizations/:organizationId/whatsapp/groups')
  @UseGuards(RolesGuard, OrganizationAccessGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  listGroups(@Param('organizationId') organizationId: string) {
    return this.whatsappGroups.listByOrganization(organizationId);
  }

  /**
   * Solicita la creacion del grupo. Queda PENDING hasta que el webhook
   * `group_lifecycle_update` traiga el group_id y el enlace de invitacion.
   */
  @Post('organizations/:organizationId/whatsapp/groups')
  @UseGuards(RolesGuard, OrganizationAccessGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  createGroup(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateWhatsappGroupDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.whatsappGroups.create(organizationId, dto, user.uid);
  }

  @Post('organizations/:organizationId/whatsapp/groups/:id/invite-link/reset')
  @UseGuards(RolesGuard, OrganizationAccessGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  resetGroupInviteLink(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.whatsappGroups.resetInviteLink(organizationId, id);
  }

  @Post('organizations/:organizationId/whatsapp/groups/:id/messages')
  @UseGuards(RolesGuard, OrganizationAccessGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  sendGroupMessage(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.whatsappGroups.sendMessage(organizationId, id, dto.body);
  }

  @Delete('organizations/:organizationId/whatsapp/groups/:id')
  @UseGuards(RolesGuard, OrganizationAccessGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async deleteGroup(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ): Promise<{ deleted: true }> {
    await this.whatsappGroups.remove(organizationId, id);
    return { deleted: true };
  }

  @Get('whatsapp/chats/:chatId/messages')
  listMessages(@Param('chatId') chatId: string) {
    return this.whatsapp.listMessages(chatId);
  }

  @Post('whatsapp/chats/:chatId/messages')
  sendMessage(
    @Param('chatId') chatId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.whatsapp.sendManualMessage(chatId, dto.body);
  }

  /** Toma/devuelve el control manual del chat (bot ON/OFF solo para ese chat). */
  @Patch('whatsapp/chats/:chatId/bot-toggle')
  toggleBot(
    @Param('chatId') chatId: string,
    @Body() dto: ToggleBotDto,
  ) {
    return this.whatsapp.toggleBot(chatId, dto.botEnabled);
  }

  @Post('whatsapp/chats/:chatId/request-info')
  requestInfo(
    @Param('chatId') chatId: string,
    @Body() dto: RequestInfoDto,
  ) {
    return this.whatsapp.requestInformation(chatId, dto.body);
  }

  // ----------------------------------------------------------------------
  // Parser del payload de Meta -> mensajes normalizados
  // ----------------------------------------------------------------------

  private parsePayload(payload: unknown): NormalizedInboundMessage[] {
    const result: NormalizedInboundMessage[] = [];
    const body = payload as {
      entry?: {
        changes?: {
          value?: {
            metadata?: { phone_number_id?: string };
            contacts?: { profile?: { name?: string } }[];
            messages?: {
              from: string;
              type: string;
              group_id?: string;
              text?: { body: string };
              image?: { link?: string };
              video?: { link?: string };
              document?: { link?: string };
            }[];
          };
        }[];
      }[];
    };

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value?.messages) continue;
        const phoneNumberId = value.metadata?.phone_number_id;
        const profileName = value.contacts?.[0]?.profile?.name;

        for (const m of value.messages) {
          // Los mensajes de grupos no pasan por el bot 1:1 (no son chats).
          if (m.group_id) continue;
          result.push({
            phone: m.from,
            inboundPhoneNumberId: phoneNumberId,
            profileName,
            messageType: this.mapType(m.type),
            text: m.text?.body,
            mediaUrl:
              m.image?.link ?? m.video?.link ?? m.document?.link ?? undefined,
          });
        }
      }
    }
    return result;
  }

  /** Extrae los eventos de grupos (`value.groups[]`) de los webhooks group_*. */
  private parseGroupEvents(payload: unknown): GroupWebhookEvent[] {
    const body = payload as {
      entry?: {
        changes?: {
          field?: string;
          value?: { groups?: Omit<GroupWebhookEvent, 'field'>[] };
        }[];
      }[];
    };
    const result: GroupWebhookEvent[] = [];
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (!change.field?.startsWith('group_')) continue;
        for (const g of change.value?.groups ?? []) {
          result.push({ ...g, field: change.field });
        }
      }
    }
    return result;
  }

  private mapType(type: string): MessageType {
    switch (type) {
      case 'image':
        return MessageType.IMAGE;
      case 'video':
        return MessageType.VIDEO;
      case 'document':
        return MessageType.FILE;
      default:
        return MessageType.TEXT;
    }
  }
}
