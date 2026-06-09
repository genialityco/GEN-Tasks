import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { NotificationChannel } from '@gen-task/shared';

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
