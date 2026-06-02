import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CustomFieldType, UserRole } from '@gen-task/shared';

export class CustomFieldOptionDto {
  @IsString() @MinLength(1) label!: string;
  @IsString() @MinLength(1) value!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateCustomFieldDto {
  @IsString() @MinLength(1) label!: string;

  @IsEnum(CustomFieldType)
  type!: CustomFieldType;

  @IsOptional() @IsBoolean() required?: boolean;

  @IsOptional() @IsArray() @IsString({ each: true })
  requiredOnStatuses?: string[];

  @IsOptional() @IsArray() @IsEnum(UserRole, { each: true })
  visibleForRoles?: UserRole[];

  @IsOptional() @IsArray() @IsEnum(UserRole, { each: true })
  editableForRoles?: UserRole[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomFieldOptionDto)
  options?: CustomFieldOptionDto[];

  @IsOptional() @IsInt() order?: number;
}

/**
 * Update de campo: NO permite cambiar `type` (regla del dominio: no se puede
 * cambiar el tipo si existen actividades). Para cambiar tipo se crea un campo nuevo.
 */
export class UpdateCustomFieldDto {
  @IsOptional() @IsString() @MinLength(1) label?: string;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) requiredOnStatuses?: string[];
  @IsOptional() @IsArray() @IsEnum(UserRole, { each: true }) visibleForRoles?: UserRole[];
  @IsOptional() @IsArray() @IsEnum(UserRole, { each: true }) editableForRoles?: UserRole[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomFieldOptionDto)
  options?: CustomFieldOptionDto[];

  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
