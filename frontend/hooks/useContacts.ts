'use client';

import { contactsApi } from '../services/api/contacts.api';
import { useAsync } from './useAsync';

/** Campos de contacto definidos por la organizacion. */
export function useContactFields(organizationId: string) {
  return useAsync(
    () => contactsApi.listFields(organizationId),
    [organizationId],
  );
}

/** Contactos de una organizacion. */
export function useContacts(organizationId: string) {
  return useAsync(() => contactsApi.list(organizationId), [organizationId]);
}

/** Contactos asociados a un proyecto (derivados de sus actividades). */
export function useProjectContacts(projectId: string) {
  return useAsync(() => contactsApi.listByProject(projectId), [projectId]);
}
