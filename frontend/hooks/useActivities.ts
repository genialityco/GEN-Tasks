'use client';

import {
  activitiesApi,
  type ActivityFilters,
} from '../services/api/activities.api';
import { useAsync } from './useAsync';

/** Actividades de un proyecto, con filtros opcionales. */
export function useActivities(projectId: string, filters?: ActivityFilters) {
  return useAsync(
    () => activitiesApi.listByProject(projectId, filters),
    [projectId, JSON.stringify(filters ?? {})],
  );
}
