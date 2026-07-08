import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateActivityDto {
  @IsString()
  @MinLength(1)
  name!: string;

  /** Estado inicial; si se omite, se usa el estado por defecto del proyecto. */
  @IsOptional()
  @IsString()
  statusId?: string;

  @IsOptional()
  @IsString()
  scheduledDate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  responsibleIds?: string[];

  /** Contactos relacionados con la actividad. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contactIds?: string[];

  /** Valores de campos personalizados indexados por la key del campo. */
  @IsOptional()
  @IsObject()
  customFieldValues?: Record<string, unknown>;
}
