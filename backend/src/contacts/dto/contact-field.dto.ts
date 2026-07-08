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
import { CustomFieldType } from '@gen-task/shared';

export class ContactFieldOptionDto {
  @IsString() @MinLength(1) label!: string;
  @IsString() @MinLength(1) value!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateContactFieldDto {
  @IsString() @MinLength(1) label!: string;

  @IsEnum(CustomFieldType)
  type!: CustomFieldType;

  @IsOptional() @IsBoolean() required?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContactFieldOptionDto)
  options?: ContactFieldOptionDto[];

  @IsOptional() @IsInt() order?: number;
}

/**
 * Update de campo: NO permite cambiar `type` (misma regla que en proyectos: para
 * cambiar el tipo se crea un campo nuevo). Solo label, opciones, obligatoriedad.
 */
export class UpdateContactFieldDto {
  @IsOptional() @IsString() @MinLength(1) label?: string;
  @IsOptional() @IsBoolean() required?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContactFieldOptionDto)
  options?: ContactFieldOptionDto[];

  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
