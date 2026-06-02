import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { UserRole } from '@gen-task/shared';

/** Asigna a un usuario un rol (ADMIN o GESTOR) dentro de una organizacion. */
export class CreateMembershipDto {
  @IsString()
  userId!: string;

  @IsString()
  organizationId!: string;

  @IsEnum(UserRole)
  role!: UserRole.ADMIN | UserRole.GESTOR;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  projectIds?: string[];
}
