import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateActivityDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  scheduledDate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  responsibleIds?: string[];

  @IsOptional()
  @IsObject()
  customFieldValues?: Record<string, unknown>;
}

export class ChangeStatusDto {
  @IsString()
  statusId!: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
