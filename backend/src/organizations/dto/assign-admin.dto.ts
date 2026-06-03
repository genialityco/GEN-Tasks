import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/** Asigna un admin por email: lo crea si no existe, o reutiliza el existente. */
export class AssignAdminDto {
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
