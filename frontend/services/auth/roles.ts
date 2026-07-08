import { AuthenticatedUser, UserRole } from '@gen-task/shared';

export function isSuperAdmin(user: AuthenticatedUser | null): boolean {
  return user?.globalRole === UserRole.SUPER_ADMIN;
}

/** Rol efectivo del usuario en una organizacion (SUPER_ADMIN gana). */
export function roleInOrganization(
  user: AuthenticatedUser | null,
  organizationId: string,
): UserRole | null {
  if (!user) return null;
  if (isSuperAdmin(user)) return UserRole.SUPER_ADMIN;
  const membership = user.memberships.find(
    (m) => m.organizationId === organizationId,
  );
  return membership?.role ?? null;
}

export function canAccessOrganization(
  user: AuthenticatedUser | null,
  organizationId: string,
): boolean {
  return roleInOrganization(user, organizationId) !== null;
}

/** Define que pestanas del proyecto puede ver cada rol (ver spec seccion 17). */
export function canViewProjectTab(
  role: UserRole | null,
  tab: 'activities' | 'host' | 'gestores' | 'config' | 'contacts',
): boolean {
  if (!role) return false;
  switch (tab) {
    case 'activities':
    case 'host':
      return [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.GESTOR].includes(
        role,
      );
    case 'gestores':
    case 'config':
    case 'contacts':
      return [UserRole.SUPER_ADMIN, UserRole.ADMIN].includes(role);
    default:
      return false;
  }
}
