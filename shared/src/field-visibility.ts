import { ConditionOperator, LogicalOperator } from './enums';
import { ActivityCustomField, RuleCondition } from './models/project';

/** Forma minima de una actividad para evaluar visibilidad de campos. */
export type ActivityLike = {
  customFieldValues?: Record<string, unknown>;
} & Record<string, unknown>;

/** Lee el valor de un campo (base o personalizado) desde una actividad. */
function readFieldValue(activity: ActivityLike, fieldKey: string): unknown {
  if (fieldKey in activity) return activity[fieldKey];
  return activity.customFieldValues?.[fieldKey];
}

/** Considera vacio: undefined/null/'' y arreglos vacios (campos de archivo). */
function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Evalua una sola condicion contra una actividad. */
function evaluateCondition(
  condition: RuleCondition,
  activity: ActivityLike,
): boolean {
  const actual = readFieldValue(activity, condition.fieldKey);
  const expected = condition.value;
  switch (condition.operator) {
    case ConditionOperator.EQUALS:
      return actual === expected;
    case ConditionOperator.NOT_EQUALS:
      return actual !== expected;
    case ConditionOperator.IN:
      return Array.isArray(expected) && expected.includes(actual);
    case ConditionOperator.NOT_IN:
      return Array.isArray(expected) && !expected.includes(actual);
    case ConditionOperator.IS_EMPTY:
      return isEmptyValue(actual);
    case ConditionOperator.IS_NOT_EMPTY:
      return !isEmptyValue(actual);
    default:
      return false;
  }
}

/**
 * Indica si un campo personalizado es visible (y por tanto exigible) para una
 * actividad, segun sus condiciones de visibilidad. Sin condiciones = siempre
 * visible. Compartido entre frontend y backend para un comportamiento uniforme.
 */
export function isFieldVisibleForActivity(
  field: Pick<
    ActivityCustomField,
    'visibilityConditions' | 'visibilityLogicalOperator'
  >,
  activity: ActivityLike,
): boolean {
  const conditions = field.visibilityConditions;
  if (!conditions || conditions.length === 0) return true;
  const op = field.visibilityLogicalOperator ?? LogicalOperator.AND;
  return op === LogicalOperator.OR
    ? conditions.some((c) => evaluateCondition(c, activity))
    : conditions.every((c) => evaluateCondition(c, activity));
}
