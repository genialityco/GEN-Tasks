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
import {
  ConditionOperator,
  CustomFieldType,
  LogicalOperator,
  UserRole,
} from '@gen-task/shared';

export class CustomFieldOptionDto {
  @IsString() @MinLength(1) label!: string;
  @IsString() @MinLength(1) value!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/**
 * Condicion de visibilidad de un campo (mismo shape que `RuleCondition`). El
 * `value` es libre (string, numero o arreglo segun el operador), por eso no se
 * valida su tipo aqui.
 */
export class RuleConditionDto {
  @IsString() fieldKey!: string;
  @IsEnum(ConditionOperator) operator!: ConditionOperator;
  @IsOptional() value?: unknown;
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

  /** Condiciones de visibilidad: el campo solo se muestra/exige si se cumplen. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  visibilityConditions?: RuleConditionDto[];

  @IsOptional() @IsEnum(LogicalOperator) visibilityLogicalOperator?: LogicalOperator;

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  visibilityConditions?: RuleConditionDto[];

  @IsOptional() @IsEnum(LogicalOperator) visibilityLogicalOperator?: LogicalOperator;

  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
