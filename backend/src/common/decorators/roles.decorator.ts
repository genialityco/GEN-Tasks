import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@gen-task/shared';

export const ROLES_KEY = 'roles';

/**
 * Restringe un endpoint a uno o varios roles.
 * El RolesGuard valida el rol global (SUPER_ADMIN) o el rol de la membresia
 * del usuario en la organizacion del request.
 *
 * Ej: @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
