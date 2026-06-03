import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LogicalOperator } from '@gen-task/shared';
import { RuleConditionDto } from '../../gestores/dto/gestor-access-rule.dto';

export class ComplianceDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  defaultDurationDays?: number;

  @IsInt()
  @Min(0)
  attentionThresholdDays!: number;

  @IsInt()
  @Min(0)
  criticalThresholdDays!: number;
}

export class StatusTransitionGuardDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  toStatusId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  conditions!: RuleConditionDto[];

  @IsEnum(LogicalOperator)
  logicalOperator!: LogicalOperator;

  @IsOptional()
  @IsString()
  message?: string;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ComplianceDto)
  compliance?: ComplianceDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hiddenColumnKeys?: string[];

  @IsOptional()
  @IsBoolean()
  linearStatusFlow?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StatusTransitionGuardDto)
  transitionGuards?: StatusTransitionGuardDto[];
}
