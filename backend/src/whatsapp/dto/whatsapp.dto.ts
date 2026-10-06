import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NotificationChannel, WhatsappTemplateName } from '@gen-task/shared';

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  body!: string;
}

export class ToggleBotDto {
  @IsBoolean()
  botEnabled!: boolean;
}

export class RequestInfoDto {
  @IsString()
  @MinLength(1)
  body!: string;
}

export class CreateTemplateDto {
  @IsString() @MinLength(1) key!: string;
  @IsString() @MinLength(1) name!: string;
  @IsString() @MinLength(1) body!: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsEnum(NotificationChannel) channel?: NotificationChannel;
}

export class UpdateTemplateDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() @MinLength(1) body?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsEnum(NotificationChannel) channel?: NotificationChannel;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/**
 * Envio de un mensaje de prueba a un telefono, desde el formulario de una
 * automatizacion. Si `templateName` viene definido, se envia esa plantilla
 * Meta con `templateParams` (posicionales); si no, se envia `body` como texto
 * libre (mismo canal que usa la accion SEND_WHATSAPP de las reglas).
 */
export class SendTestMessageDto {
  @IsString() @MinLength(6) phone!: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsEnum(WhatsappTemplateName) templateName?: WhatsappTemplateName;
  @IsOptional() @IsArray() @IsString({ each: true }) templateParams?: string[];
}

/** Creacion de un grupo de WhatsApp via Groups API (limites de Meta). */
export class CreateWhatsappGroupDto {
  @IsString() @MinLength(1) @MaxLength(128) subject!: string;
  @IsOptional() @IsString() @MaxLength(2048) description?: string;
  @IsOptional()
  @IsIn(['auto_approve', 'approval_required'])
  joinApprovalMode?: 'auto_approve' | 'approval_required';
}
