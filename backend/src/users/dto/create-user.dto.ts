import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

/** Crea un usuario en Firebase Auth + Firestore (ej: un ADMIN creado por SUPER_ADMIN). */
export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  /** Contrasena inicial; opcional si se usara enlace de invitacion. */
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  /** Marca al usuario como SUPER_ADMIN global. Solo lo usa otro SUPER_ADMIN. */
  @IsOptional()
  @IsBoolean()
  isSuperAdmin?: boolean;
}
