'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { Anchor, Breadcrumbs as MantineBreadcrumbs, Text } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { useAsync } from '../../hooks/useAsync';
import { organizationsApi } from '../../services/api/organizations.api';
import { projectsApi } from '../../services/api/projects.api';
import { activitiesApi } from '../../services/api/activities.api';
import { useAuth } from '../../services/auth/AuthProvider';
import { isSuperAdmin } from '../../services/auth/roles';

interface Crumb {
  label: string;
  /** Sin href = nivel actual (no navegable). */
  href?: string;
}

/**
 * Migas de pan: muestran la ruta completa donde esta parado el usuario
 * (Organizaciones › Organizacion › Proyecto › Actividad) y permiten volver a
 * cualquier nivel superior. El primer nivel apunta al listado de
 * organizaciones del rol (SUPER_ADMIN o miembro). Los nombres se cargan de la
 * API; mientras tanto se muestra una etiqueta generica.
 */
export function Breadcrumbs() {
  const params = useParams<{
    organizationId?: string;
    projectId?: string;
    activityId?: string;
  }>();
  const pathname = usePathname();
  const { profile } = useAuth();

  const { organizationId, projectId, activityId } = params;

  const { data: organization } = useAsync(
    () =>
      organizationId
        ? organizationsApi.get(organizationId)
        : Promise.resolve(null),
    [organizationId],
  );
  const { data: project } = useAsync(
    () => (projectId ? projectsApi.get(projectId) : Promise.resolve(null)),
    [projectId],
  );
  const { data: activity } = useAsync(
    () => (activityId ? activitiesApi.get(activityId) : Promise.resolve(null)),
    [activityId],
  );

  const homeHref = isSuperAdmin(profile) ? '/super-admin' : '/organizations';
  const crumbs: Crumb[] = [{ label: 'Organizaciones', href: homeHref }];

  if (organizationId) {
    crumbs.push({
      label: organization?.name ?? 'Organización',
      href: `/organizations/${organizationId}`,
    });
  }

  if (pathname?.endsWith('/chat-whatsapp')) {
    crumbs.push({ label: 'ChatWhatsapp' });
  }

  if (projectId) {
    crumbs.push({
      label: project?.name ?? 'Proyecto',
      href: `/organizations/${organizationId}/projects/${projectId}`,
    });
  }

  if (activityId) {
    crumbs.push({ label: activity?.name ?? 'Actividad' });
  }

  return (
    <MantineBreadcrumbs
      separator={<IconChevronRight size={14} />}
      styles={{ root: { flexWrap: 'wrap' } }}
    >
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        if (isLast || !c.href) {
          return (
            <Text key={i} size="sm" fw={600}>
              {c.label}
            </Text>
          );
        }
        return (
          <Anchor key={i} component={Link} href={c.href} size="sm" c="dimmed">
            {c.label}
          </Anchor>
        );
      })}
    </MantineBreadcrumbs>
  );
}
