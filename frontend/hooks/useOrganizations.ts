'use client';

import { organizationsApi } from '../services/api/organizations.api';
import { useAsync } from './useAsync';

/** Lista de organizaciones visibles para el usuario autenticado. */
export function useOrganizations() {
  return useAsync(() => organizationsApi.list(), []);
}

/** Detalle de una organizacion. */
export function useOrganization(organizationId: string) {
  return useAsync(
    () => organizationsApi.get(organizationId),
    [organizationId],
  );
}
