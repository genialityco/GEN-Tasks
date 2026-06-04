'use client';

import { MultiSelect, Stack, Text } from '@mantine/core';
import {
  ConditionOperator,
  LogicalOperator,
  type ActivityCustomField,
  type ProjectStatus,
  type RuleCondition,
} from '@gen-task/shared';
import {
  ConditionBuilder,
  customFieldOptions,
  NEEDS_VALUE,
  type ConditionDraft,
} from './ConditionBuilder';

/**
 * Estado del editor de reglas de un campo (visibilidad + obligatoriedad), en una
 * forma simple y editable. La visibilidad real del modelo (`visibilityConditions`)
 * se arma/parsea desde aqui.
 */
export interface FieldRulesState {
  /** Estados en los que el campo es visible (vacio = visible en todos). */
  visibleStatuses: string[];
  /** Estados en los que el campo es obligatorio. */
  requiredStatuses: string[];
  /** Condicion adicional sobre el valor de otro campo (fieldKey '' = sin condicion). */
  valueCondition: ConditionDraft;
}

export function emptyFieldRules(): FieldRulesState {
  return {
    visibleStatuses: [],
    requiredStatuses: [],
    valueCondition: { fieldKey: '', operator: ConditionOperator.IS_NOT_EMPTY, value: '' },
  };
}

/**
 * Indica si la visibilidad de un campo encaja en el editor simple: a lo sumo una
 * condicion de estado (sobre `statusId`) y una condicion de valor, combinadas con
 * AND. Las configuraciones mas complejas (creadas por reglas) se preservan y no
 * se editan aqui para no perder informacion.
 */
export function fitsSimpleEditor(
  field: Pick<ActivityCustomField, 'visibilityConditions' | 'visibilityLogicalOperator'>,
): boolean {
  const conds = field.visibilityConditions ?? [];
  if (conds.length === 0) return true;
  if ((field.visibilityLogicalOperator ?? LogicalOperator.AND) !== LogicalOperator.AND) {
    return false;
  }
  const statusConds = conds.filter((c) => c.fieldKey === 'statusId');
  const otherConds = conds.filter((c) => c.fieldKey !== 'statusId');
  const statusOk =
    statusConds.length === 0 ||
    (statusConds.length === 1 &&
      (statusConds[0].operator === ConditionOperator.IN ||
        statusConds[0].operator === ConditionOperator.EQUALS));
  return statusOk && otherConds.length <= 1;
}

/** Parsea el campo guardado al estado del editor (para edicion). */
export function parseFieldRules(field: ActivityCustomField): FieldRulesState {
  const conds = field.visibilityConditions ?? [];
  const statusCond = conds.find(
    (c) =>
      c.fieldKey === 'statusId' &&
      (c.operator === ConditionOperator.IN || c.operator === ConditionOperator.EQUALS),
  );
  const valueCond = conds.find((c) => c !== statusCond);
  return {
    visibleStatuses: statusCond
      ? Array.isArray(statusCond.value)
        ? (statusCond.value as string[])
        : [String(statusCond.value)]
      : [],
    requiredStatuses: field.requiredOnStatuses ?? [],
    valueCondition: valueCond
      ? {
          fieldKey: valueCond.fieldKey,
          operator: valueCond.operator as ConditionOperator,
          value: valueCond.value != null ? String(valueCond.value) : '',
        }
      : { fieldKey: '', operator: ConditionOperator.IS_NOT_EMPTY, value: '' },
  };
}

/**
 * Convierte el estado del editor al payload del campo (`visibilityConditions`,
 * `visibilityLogicalOperator`, `requiredOnStatuses`). Devuelve arreglos (posibles
 * vacios) para que el update pueda limpiar reglas existentes.
 */
export function buildFieldRulesPayload(state: FieldRulesState): {
  visibilityConditions: RuleCondition[];
  visibilityLogicalOperator: LogicalOperator;
  requiredOnStatuses: string[];
} {
  const conditions: RuleCondition[] = [];
  if (state.visibleStatuses.length) {
    conditions.push({
      fieldKey: 'statusId',
      operator: ConditionOperator.IN,
      value: state.visibleStatuses,
    });
  }
  const vc = state.valueCondition;
  if (vc.fieldKey) {
    conditions.push({
      fieldKey: vc.fieldKey,
      operator: vc.operator,
      value: NEEDS_VALUE.includes(vc.operator) ? vc.value : undefined,
    });
  }
  return {
    visibilityConditions: conditions,
    visibilityLogicalOperator: LogicalOperator.AND,
    requiredOnStatuses: state.requiredStatuses,
  };
}

/**
 * Editor de reglas de un campo: en que estados se ve, bajo que condicion de valor
 * se ve, y en que estados es obligatorio. Compacto y reutilizable (crear/editar).
 */
export function FieldRulesEditor({
  statuses,
  fields,
  value,
  onChange,
}: {
  statuses: ProjectStatus[];
  /** Otros campos del proyecto, para la condicion "visible cuando ...". */
  fields: ActivityCustomField[];
  value: FieldRulesState;
  onChange: (next: FieldRulesState) => void;
}) {
  const statusData = statuses
    .filter((s) => !s.isArchived)
    .sort((a, b) => a.order - b.order)
    .map((s) => ({ value: s.id, label: s.name }));

  return (
    <Stack gap="sm">
      <MultiSelect
        label="Visible en estados"
        description="Vacío = visible en todos los estados."
        placeholder="Todos los estados"
        data={statusData}
        value={value.visibleStatuses}
        onChange={(v) => onChange({ ...value, visibleStatuses: v })}
        clearable
        searchable
      />

      <div>
        <Text size="sm" fw={500}>Visible cuando (condición opcional)</Text>
        <Text size="xs" c="dimmed" mb={4}>
          El campo aparece solo cuando otro campo cumple esta condición. Ej.: que un
          archivo esté adjunto.
        </Text>
        <ConditionBuilder
          fieldOptions={customFieldOptions(fields)}
          condition={value.valueCondition}
          onChange={(c) => onChange({ ...value, valueCondition: c })}
          emptyFieldOption="— sin condición —"
          fieldLabel="Campo"
        />
      </div>

      <MultiSelect
        label="Obligatorio en estados"
        description="Para entrar a estos estados el campo debe estar lleno: se exige al crear la actividad en ellos y al mover una actividad hacia ellos."
        placeholder="Ninguno"
        data={statusData}
        value={value.requiredStatuses}
        onChange={(v) => onChange({ ...value, requiredStatuses: v })}
        clearable
        searchable
      />
    </Stack>
  );
}
