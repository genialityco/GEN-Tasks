'use client';

import { projectsApi } from '../services/api/projects.api';
import { useAsync } from './useAsync';

/** Proyectos de una organizacion. */
export function useProjects(organizationId: string) {
  return useAsync(
    () => projectsApi.listByOrg(organizationId),
    [organizationId],
  );
}

/** Detalle de un proyecto (incluye estados y campos personalizados). */
export function useProject(projectId: string) {
  return useAsync(() => projectsApi.get(projectId), [projectId]);
}
