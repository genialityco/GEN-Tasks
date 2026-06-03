import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Datos necesarios para el alta privada de un SUPER_ADMIN.
 * El secret se valida por header y no via body para no mezclar credenciales.
 */
export class PrivateSuperAdminSignInDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}