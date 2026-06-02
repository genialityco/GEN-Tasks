import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LogicalOperator, RuleActionType, RuleEvent } from '@gen-task/shared';
import { RuleConditionDto } from '../../gestores/dto/gestor-access-rule.dto';

export class RuleActionDto {
  @IsEnum(RuleActionType)
  type!: RuleActionType;

  @IsObject()
  payload!: Record<string, unknown>;
}

export class CreateProjectRuleDto {
  @IsString() @MinLength(1) name!: string;

  @IsEnum(RuleEvent)
  event!: RuleEvent;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  conditions!: RuleConditionDto[];

  @IsEnum(LogicalOperator)
  logicalOperator!: LogicalOperator;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleActionDto)
  actions!: RuleActionDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateProjectRuleDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsEnum(RuleEvent) event?: RuleEvent;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  conditions?: RuleConditionDto[];

  @IsOptional() @IsEnum(LogicalOperator) logicalOperator?: LogicalOperator;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleActionDto)
  actions?: RuleActionDto[];

  @IsOptional() @IsBoolean() isActive?: boolean;
}
