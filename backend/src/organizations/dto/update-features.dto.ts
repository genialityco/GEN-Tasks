import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  ValidateNested,
} from 'class-validator';

/** Todas las banderas son opcionales: se hace merge parcial con las actuales. */
export class OrganizationFeaturesDto {
  @IsOptional() @IsBoolean() whatsappEnabled?: boolean;
  @IsOptional() @IsBoolean() multipleProjectsEnabled?: boolean;
  @IsOptional() @IsBoolean() customFieldsEnabled?: boolean;
  @IsOptional() @IsBoolean() customStatusesEnabled?: boolean;
  @IsOptional() @IsBoolean() triggersEnabled?: boolean;
  @IsOptional() @IsBoolean() fileUploadsEnabled?: boolean;
  @IsOptional() @IsBoolean() manualChatEnabled?: boolean;
  @IsOptional() @IsBoolean() notificationsEnabled?: boolean;
}

export class UpdateFeaturesDto {
  @IsObject()
  @ValidateNested()
  @Type(() => OrganizationFeaturesDto)
  features!: OrganizationFeaturesDto;
}
