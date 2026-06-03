import {
  Activity,
  ConditionOperator,
  LogicalOperator,
  RuleCondition,
} from '@gen-task/shared';

/** Lee el valor de un campo desde una actividad (campos base o personalizados). */
function readFieldValue(activity: Partial<Activity>, fieldKey: string): unknown {
  // Permite condiciones sobre campos base (ej: statusId) o personalizados.
  if (fieldKey in (activity as Record<string, unknown>)) {
    return (activity as Record<string, unknown>)[fieldKey];
  }
  return activity.customFieldValues?.[fieldKey];
}

/**
 * Determina si el valor de un campo se considera "vacío". Contempla los campos
 * de archivo (FILE/IMAGE/VIDEO), cuyo valor es un arreglo de adjuntos: un
 * arreglo vacío cuenta como vacío y uno con elementos como no vacío.
 */
function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Evalua una sola condicion contra una actividad. */
export function evaluateCondition(
  condition: RuleCondition,
  activity: Partial<Activity>,
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

/** Evalua un conjunto de condiciones combinadas con AND u OR. */
export function evaluateConditions(
  conditions: RuleCondition[],
  logicalOperator: LogicalOperator,
  activity: Partial<Activity>,
): boolean {
  if (conditions.length === 0) return true;
  if (logicalOperator === LogicalOperator.OR) {
    return conditions.some((c) => evaluateCondition(c, activity));
  }
  return conditions.every((c) => evaluateCondition(c, activity));
}

/**
 * Extrae valores por defecto de un conjunto de condiciones EQUALS.
 * Usado para autocompletar campos cuando un gestor con restriccion
 * (ej: tipoDeDanio = Electrico) crea una actividad.
 */
export function defaultValuesFromConditions(
  conditions: RuleCondition[],
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const c of conditions) {
    if (c.operator === ConditionOperator.EQUALS && c.value !== undefined) {
      defaults[c.fieldKey] = c.value;
    }
  }
  return defaults;
}
