import { AuthenticatedUser, UserRole } from '@gen-task/shared';

/** True si el usuario es SUPER_ADMIN (acceso total a la plataforma). */
export function isSuperAdmin(user: AuthenticatedUser): boolean {
  return user.globalRole === UserRole.SUPER_ADMIN;
}

/** Devuelve el rol efectivo del usuario en una organizacion, o null si no tiene acceso. */
export function roleInOrganization(
  user: AuthenticatedUser,
  organizationId: string,
): UserRole | null {
  if (isSuperAdmin(user)) return UserRole.SUPER_ADMIN;
  const membership = user.memberships.find(
    (m) => m.organizationId === organizationId,
  );
  return membership ? membership.role : null;
}

/** True si el usuario puede operar dentro de la organizacion (super admin o miembro). */
export function hasOrganizationAccess(
  user: AuthenticatedUser,
  organizationId: string,
): boolean {
  return roleInOrganization(user, organizationId) !== null;
}

/**
 * True si el rol efectivo del usuario en la organizacion esta dentro de los
 * roles permitidos. El SUPER_ADMIN siempre pasa.
 */
export function userMeetsRoleRequirement(
  user: AuthenticatedUser,
  organizationId: string | undefined,
  allowedRoles: UserRole[],
): boolean {
  if (isSuperAdmin(user)) return true;
  if (allowedRoles.includes(UserRole.SUPER_ADMIN) && allowedRoles.length === 1) {
    // Endpoint exclusivo de super admin y el usuario no lo es.
    return false;
  }
  if (!organizationId) return false;
  const role = roleInOrganization(user, organizationId);
  return role !== null && allowedRoles.includes(role);
}
