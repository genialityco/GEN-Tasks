import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  NotificationChannel,
  WhatsappProvider,
  WhatsappTemplateName,
} from '@gen-task/shared';

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
 * Envio de un mensaje de prueba a un telefono (o a un grupo, con `groupId`),
 * desde el formulario de una automatizacion. Si `templateName` viene
 * definido, se envia esa plantilla Meta con `templateParams` (posicionales);
 * si no, se envia `body` como texto libre (mismo canal que usa la accion
 * SEND_WHATSAPP de las reglas). `provider` elige API oficial o WhatsApp Web.
 */
export class SendTestMessageDto {
  @ValidateIf((o: SendTestMessageDto) => !o.groupId)
  @IsString()
  @MinLength(6)
  phone?: string;
  /** Id del grupo destino: doc `WhatsappGroup` (CLOUD_API) o JID (WEB). */
  @IsOptional() @IsString() @MinLength(1) groupId?: string;
  @IsOptional() @IsEnum(WhatsappProvider) provider?: WhatsappProvider;
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

/** Mensaje a un grupo de la cuenta vinculada por WhatsApp Web. */
export class SendWebGroupMessageDto {
  /** JID del grupo (`...@g.us`). */
  @IsString() @MinLength(1) groupId!: string;
  @IsString() @MinLength(1) body!: string;
}

/**
 * Inicio de la vinculacion de WhatsApp Web. Con `phone` se vincula por codigo
 * de 8 caracteres en lugar de QR (numero con codigo de pais).
 */
export class ConnectWebSessionDto {
  @IsOptional() @IsString() @MinLength(6) phone?: string;
}
