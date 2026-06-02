import {
  IsBoolean,
  IsEnum,
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { StatusType } from '@gen-task/shared';

export class CreateStatusDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(StatusType)
  type!: StatusType;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsHexColor()
  color?: string;
}

export class UpdateStatusDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsEnum(StatusType) type?: StatusType;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
