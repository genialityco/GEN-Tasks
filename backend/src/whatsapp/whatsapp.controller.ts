import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MessageType, UserRole } from '@gen-task/shared';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { OrganizationAccessGuard } from '../common/guards/organization-access.guard';
import {
  NormalizedInboundMessage,
  WhatsappService,
} from './whatsapp.service';
import {
  RequestInfoDto,
  SendMessageDto,
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
