import type {
  Contact,
  ContactCustomField,
  CustomFieldType,
} from '@gen-task/shared';
import { apiClient } from './client';

export interface ContactFieldOptionInput {
  label: string;
  value: string;
  isActive?: boolean;
}

export interface CreateContactFieldInput {
  label: string;
  type: CustomFieldType;
  required?: boolean;
  options?: ContactFieldOptionInput[];
  order?: number;
}

export interface ContactImportResult {
  created: Array<{ row: number; id: string }>;
  failed: Array<{ row: number; reason: string }>;
}

const base = (organizationId: string) => `/organizations/${organizationId}`;

export const contactsApi = {
  // Campos de contacto
  listFields: (organizationId: string) =>
    apiClient.get<ContactCustomField[]>(`${base(organizationId)}/contact-fields`),
  createField: (organizationId: string, body: CreateContactFieldInput) =>
    apiClient.post<ContactCustomField>(
      `${base(organizationId)}/contact-fields`,
      body,
    ),
  updateField: (
    organizationId: string,
    fieldId: string,
    body: Partial<CreateContactFieldInput> & { isActive?: boolean },
  ) =>
    apiClient.patch<ContactCustomField>(
      `${base(organizationId)}/contact-fields/${fieldId}`,
      body,
    ),
  archiveField: (organizationId: string, fieldId: string) =>
    apiClient.patch<void>(
      `${base(organizationId)}/contact-fields/${fieldId}/archive`,
    ),
  deleteField: (organizationId: string, fieldId: string) =>
    apiClient.delete<void>(
      `${base(organizationId)}/contact-fields/${fieldId}`,
    ),

  // Contactos
  list: (organizationId: string) =>
    apiClient.get<Contact[]>(`${base(organizationId)}/contacts`),
  /** Contactos asociados a un proyecto (derivados de sus actividades). */
  listByProject: (projectId: string) =>
    apiClient.get<Contact[]>(`/projects/${projectId}/contacts`),
  create: (
    organizationId: string,
    body: { values: Record<string, unknown> },
  ) => apiClient.post<Contact>(`${base(organizationId)}/contacts`, body),
  update: (
    organizationId: string,
    contactId: string,
    body: { values?: Record<string, unknown> },
  ) =>
    apiClient.patch<Contact>(
      `${base(organizationId)}/contacts/${contactId}`,
      body,
    ),
  archive: (organizationId: string, contactId: string) =>
    apiClient.patch<void>(
      `${base(organizationId)}/contacts/${contactId}/archive`,
    ),
  remove: (organizationId: string, contactId: string) =>
    apiClient.delete<void>(`${base(organizationId)}/contacts/${contactId}`),

  // Importacion / plantilla
  template: (organizationId: string) =>
    apiClient.get<{ columns: string[] }>(
      `${base(organizationId)}/contacts/template`,
    ),
  import: (organizationId: string, rows: Array<Record<string, string>>) =>
    apiClient.post<ContactImportResult>(
      `${base(organizationId)}/contacts/import`,
      { rows },
    ),
};
