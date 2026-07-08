import { IsObject, IsOptional } from 'class-validator';

export class CreateContactDto {
  /** Datos del contacto: clave = key del campo, valor segun su tipo. */
  @IsObject()
  values!: Record<string, unknown>;
}

export class UpdateContactDto {
  @IsOptional() @IsObject() values?: Record<string, unknown>;
}
