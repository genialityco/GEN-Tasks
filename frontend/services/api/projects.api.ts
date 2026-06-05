import type {
  ActivityCustomField,
  CustomFieldType,
  LogicalOperator,
  Project,
  ProjectCompliance,
  ProjectStatus,
  RuleCondition,
  StatusTransitionGuard,
  StatusType,
  UserRole,
} from '@gen-task/shared';
import { apiClient } from './client';

export interface CreateStatusInput {
  name: string;
  type: StatusType;
  order?: number;
  color?: string;
}

export interface CustomFieldOptionInput {
  label: string;
  value: string;
  isActive?: boolean;
}

export interface CreateCustomFieldInput {
  label: string;
  type: CustomFieldType;
  required?: boolean;
  requiredOnStatuses?: string[];
  visibleForRoles?: UserRole[];
  editableForRoles?: UserRole[];
  visibilityConditions?: RuleCondition[];
  visibilityLogicalOperator?: LogicalOperator;
  options?: CustomFieldOptionInput[];
  order?: number;
}

export const projectsApi = {
  listByOrg: (organizationId: string) =>
    apiClient.get<Project[]>(`/organizations/${organizationId}/projects`),
  get: (projectId: string) => apiClient.get<Project>(`/projects/${projectId}`),
  create: (organizationId: string, body: { name: string; description?: string }) =>
    apiClient.post<Project>(`/organizations/${organizationId}/projects`, body),
  update: (
    projectId: string,
    body: {
      name?: string;
      description?: string;
      compliance?: ProjectCompliance;
      hiddenColumnKeys?: string[];
      linearStatusFlow?: boolean;
      alwaysShowFields?: boolean;
      transitionGuards?: StatusTransitionGuard[];
    },
  ) => apiClient.patch<Project>(`/projects/${projectId}`, body),
  archive: (projectId: string) =>
    apiClient.patch<Project>(`/projects/${projectId}/archive`),

  // Estados
  listStatuses: (projectId: string) =>
    apiClient.get<ProjectStatus[]>(`/projects/${projectId}/statuses`),
  createStatus: (projectId: string, body: CreateStatusInput) =>
    apiClient.post<ProjectStatus>(`/projects/${projectId}/statuses`, body),
  updateStatus: (
    projectId: string,
    statusId: string,
    body: Partial<CreateStatusInput> & { isActive?: boolean },
  ) =>
    apiClient.patch<ProjectStatus>(
      `/projects/${projectId}/statuses/${statusId}`,
      body,
    ),
  archiveStatus: (projectId: string, statusId: string) =>
    apiClient.patch<void>(
      `/projects/${projectId}/statuses/${statusId}/archive`,
    ),
  deleteStatus: (projectId: string, statusId: string) =>
    apiClient.delete<void>(`/projects/${projectId}/statuses/${statusId}`),

  // Campos personalizados
  listCustomFields: (projectId: string) =>
    apiClient.get<ActivityCustomField[]>(`/projects/${projectId}/custom-fields`),
  createCustomField: (projectId: string, body: CreateCustomFieldInput) =>
    apiClient.post<ActivityCustomField>(
      `/projects/${projectId}/custom-fields`,
      body,
    ),
  updateCustomField: (
    projectId: string,
    fieldId: string,
    body: Partial<CreateCustomFieldInput> & { isActive?: boolean },
  ) =>
    apiClient.patch<ActivityCustomField>(
      `/projects/${projectId}/custom-fields/${fieldId}`,
      body,
    ),
  archiveCustomField: (projectId: string, fieldId: string) =>
    apiClient.patch<void>(
      `/projects/${projectId}/custom-fields/${fieldId}/archive`,
    ),
  deleteCustomField: (projectId: string, fieldId: string) =>
    apiClient.delete<void>(`/projects/${projectId}/custom-fields/${fieldId}`),
};
