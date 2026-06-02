import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

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
}

export class UpdateTemplateDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() @MinLength(1) body?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
