import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  FieldAlertRecipientType,
  FieldAlertTrigger,
  LogicalOperator,
  NotificationChannel,
  WhatsappRecipientType,
} from '@gen-task/shared';
import { RuleConditionDto } from '../../gestores/dto/gestor-access-rule.dto';

export class StatusComplianceAlertDto {
  @IsString()
  statusId!: string;

  @IsInt()
  @Min(0)
  daysFromCreation!: number;

  @IsBoolean()
  enabled!: boolean;

  @IsEnum(WhatsappRecipientType)
  recipientType!: WhatsappRecipientType;

  @IsOptional()
  @IsString()
  recipientUserId?: string;

  @IsOptional()
  @IsString()
  recipientPhone?: string;

  @IsString()
  message!: string;
}

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StatusComplianceAlertDto)
  statusAlerts?: StatusComplianceAlertDto[];
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

export class FieldAlertRecipientDto {
  @IsEnum(FieldAlertRecipientType)
  type!: FieldAlertRecipientType;

  @IsOptional()
  @IsString()
  value?: string;
}

export class FieldAlertDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsBoolean()
  enabled!: boolean;

  @IsEnum(FieldAlertTrigger)
  trigger!: FieldAlertTrigger;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  requiredFieldKeys!: string[];

  @IsOptional()
  @IsString()
  dateFieldKey?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  sendAtHour?: number;

  @IsOptional()
  @IsString()
  sourceFieldKey?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  delayDays?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldAlertRecipientDto)
  recipients!: FieldAlertRecipientDto[];

  @IsOptional()
  @IsIn(Object.values(NotificationChannel))
  memberChannel?: NotificationChannel;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsString()
  message!: string;
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
  @IsBoolean()
  alwaysShowFields?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StatusTransitionGuardDto)
  transitionGuards?: StatusTransitionGuardDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldAlertDto)
  fieldAlerts?: FieldAlertDto[];
}
