import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthenticatedUser } from '@gen-task/shared';
import { hasOrganizationAccess } from '../access-control';

/**
 * Asegura que el usuario tenga acceso a la organizacion indicada en
 * `:organizationId`. Aplica el tenant scoping a nivel de ruta para cualquier
 * miembro (sin exigir un rol especifico). Si la ruta no expone organizationId,
 * el guard no bloquea (el control se delega al servicio del recurso).
 */
@Injectable()
export class OrganizationAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) throw new ForbiddenException('Usuario no autenticado.');

    const organizationId: string | undefined = request.params?.organizationId;
    if (!organizationId) return true;

    if (!hasOrganizationAccess(user, organizationId)) {
      throw new ForbiddenException('No tienes acceso a esta organizacion.');
    }
    return true;
  }
}
