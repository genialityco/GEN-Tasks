import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser, UserRole } from '@gen-task/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { userMeetsRoleRequirement } from '../access-control';

/**
 * Valida que el usuario cumpla con los roles requeridos por @Roles.
 *
 * El organizationId se resuelve desde los params de la ruta
 * (`:organizationId`). Para rutas anidadas que solo exponen projectId o
 * activityId, el control de organizacion se delega al servicio del dominio
 * (que resuelve el organizationId del recurso y aplica tenant scoping).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) throw new ForbiddenException('Usuario no autenticado.');

    const organizationId: string | undefined = request.params?.organizationId;

    if (!userMeetsRoleRequirement(user, organizationId, requiredRoles)) {
      throw new ForbiddenException(
        'No tienes permisos suficientes para esta accion.',
      );
    }
    return true;
  }
}
