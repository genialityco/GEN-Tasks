import type {
  ConditionOperator,
  LogicalOperator,
  ProjectRule,
  RuleActionType,
  RuleEvent,
} from '@gen-task/shared';
import { apiClient } from './client';

export interface RuleConditionInput {
  fieldKey: string;
  operator: ConditionOperator;
  value?: unknown;
}

export interface RuleActionInput {
  type: RuleActionType;
  payload: Record<string, unknown>;
}

export interface CreateRuleInput {
  name: string;
  event: RuleEvent;
  conditions: RuleConditionInput[];
  logicalOperator: LogicalOperator;
  actions: RuleActionInput[];
  /** Solo para ON_STATUS_CHANGED: acota el disparo a una transicion. */
  fromStatusId?: string;
  toStatusId?: string;
  isActive?: boolean;
}

export const rulesApi = {
  list: (projectId: string) =>
    apiClient.get<ProjectRule[]>(`/projects/${projectId}/rules`),
  create: (projectId: string, body: CreateRuleInput) =>
    apiClient.post<ProjectRule>(`/projects/${projectId}/rules`, body),
  update: (projectId: string, ruleId: string, body: Partial<CreateRuleInput>) =>
    apiClient.patch<ProjectRule>(
      `/projects/${projectId}/rules/${ruleId}`,
      body,
    ),
  remove: (projectId: string, ruleId: string) =>
    apiClient.delete<void>(`/projects/${projectId}/rules/${ruleId}`),
};
