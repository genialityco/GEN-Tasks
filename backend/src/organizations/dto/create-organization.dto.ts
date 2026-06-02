import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  name!: string;

  /** userIds de administradores iniciales. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  admins?: string[];
}
