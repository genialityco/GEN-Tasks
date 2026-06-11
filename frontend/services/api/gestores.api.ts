import type {
  GestorAccessRule,
  GestorListItem,
  LogicalOperator,
  OrganizationMembership,
} from '@gen-task/shared';
import { apiClient } from './client';
import type { RuleConditionInput } from './rules.api';

export interface AllowedTransitionInput {
  fromStatusId: string;
  toStatusId: string;
}

export interface UpsertGestorRuleInput {
  projectId: string;
  gestorId: string;
  conditions: RuleConditionInput[];
  logicalOperator: LogicalOperator;
  allowedStatusTransitions?: AllowedTransitionInput[];
  allowAnyStatusTransition?: boolean;
}

export const gestoresApi = {
  list: (organizationId: string) =>
    apiClient.get<GestorListItem[]>(
      `/organizations/${organizationId}/gestores`,
    ),
  create: (
    organizationId: string,
    body: {
      email: string;
      name: string;
      password?: string;
      phone?: string;
      projectIds?: string[];
    },
  ) =>
    apiClient.post<OrganizationMembership>(
      `/organizations/${organizationId}/gestores`,
      body,
    ),
  rulesByProject: (organizationId: string, projectId: string) =>
    apiClient.get<GestorAccessRule[]>(
      `/organizations/${organizationId}/gestores/rules/${projectId}`,
    ),
  upsertRule: (organizationId: string, body: UpsertGestorRuleInput) =>
    apiClient.put<GestorAccessRule>(
      `/organizations/${organizationId}/gestores/access-rules`,
      body,
    ),
};
