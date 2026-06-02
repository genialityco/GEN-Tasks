import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ConditionOperator, LogicalOperator } from '@gen-task/shared';

export class RuleConditionDto {
  @IsString() fieldKey!: string;

  @IsEnum(ConditionOperator)
  operator!: ConditionOperator;

  @IsOptional()
  value?: unknown;
}

export class AllowedStatusTransitionDto {
  @IsString() fromStatusId!: string;
  @IsString() toStatusId!: string;
}

/** Crea/reemplaza la regla de acceso de un gestor sobre un proyecto. */
export class UpsertGestorAccessRuleDto {
  @IsString() projectId!: string;
  @IsString() gestorId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  conditions!: RuleConditionDto[];

  @IsEnum(LogicalOperator)
  logicalOperator!: LogicalOperator;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllowedStatusTransitionDto)
  allowedStatusTransitions?: AllowedStatusTransitionDto[];

  @IsOptional()
  @IsBoolean()
  allowAnyStatusTransition?: boolean;
}
