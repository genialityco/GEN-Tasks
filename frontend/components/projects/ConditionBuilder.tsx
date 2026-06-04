'use client';

import { Group, Select, TextInput } from '@mantine/core';
import { ConditionOperator, type ActivityCustomField } from '@gen-task/shared';

/** Borrador de una condicion en edicion (el `value` se maneja como string en la UI). */
export interface ConditionDraft {
  fieldKey: string;
  operator: ConditionOperator;
  value: string;
}

export interface FieldOption {
  value: string;
  label: string;
}

/** Operadores que requieren un valor de comparacion. */
export const NEEDS_VALUE: ConditionOperator[] = [
  ConditionOperator.EQUALS,
  ConditionOperator.NOT_EQUALS,
  ConditionOperator.IN,
  ConditionOperator.NOT_IN,
];

/**
 * Etiquetas neutras del operador, redactadas como hecho ("es igual a"). Pensadas
 * para las automatizaciones/triggers, donde la condicion describe cuando disparar.
 */
export const CONDITION_OPERATOR_LABELS: Record<ConditionOperator, string> = {
  EQUALS: 'es igual a',
  NOT_EQUALS: 'es distinto de',
  IN: 'esta en (lista)',
  NOT_IN: 'no esta en (lista)',
  IS_EMPTY: 'esta vacio',
  IS_NOT_EMPTY: 'tiene un valor',
};

/**
 * Etiquetas en clave de requisito ("debe ser igual a"). Pensadas para las
 * restricciones/bloqueos, donde la condicion es lo que DEBE cumplirse para
 * permitir el cambio de estado.
 */
export const REQUIREMENT_OPERATOR_LABELS: Record<ConditionOperator, string> = {
  EQUALS: 'debe ser igual a',
  NOT_EQUALS: 'debe ser distinto de',
  IN: 'debe estar en',
  NOT_IN: 'no debe estar en',
  IS_EMPTY: 'debe estar vacio',
  IS_NOT_EMPTY: 'debe tener un valor (no vacio)',
};

/** Opciones de campo a partir de los campos personalizados activos del proyecto. */
export function customFieldOptions(fields: ActivityCustomField[]): FieldOption[] {
  return fields
    .filter((f) => !f.isArchived)
    .map((f) => ({ value: f.key, label: f.label }));
}

/**
 * Editor de una condicion (campo + operador + valor), compartido por las
 * restricciones de estado y las automatizaciones para que ambas se vean y se
 * comporten igual. El operador y el valor solo se muestran cuando hay un campo
 * seleccionado.
 */
export function ConditionBuilder({
  fieldOptions,
  condition,
  onChange,
  operatorLabels = CONDITION_OPERATOR_LABELS,
  emptyFieldOption,
  fieldLabel = 'Campo',
  size = 'sm',
}: {
  fieldOptions: FieldOption[];
  condition: ConditionDraft;
  onChange: (next: ConditionDraft) => void;
  /** Etiquetas del operador segun el contexto (requisito vs. trigger). */
  operatorLabels?: Record<ConditionOperator, string>;
  /** Si se define, agrega una opcion "sin condicion" (value vacio) con este texto. */
  emptyFieldOption?: string;
  fieldLabel?: string;
  size?: string;
}) {
  const data: FieldOption[] = emptyFieldOption
    ? [{ value: '', label: emptyFieldOption }, ...fieldOptions]
    : fieldOptions;
  const hasField = condition.fieldKey !== '';
  const needsValue = NEEDS_VALUE.includes(condition.operator);

  return (
    <Group gap="sm" align="flex-end" wrap="wrap">
      <Select
        label={fieldLabel}
        placeholder={emptyFieldOption ?? 'Selecciona...'}
        data={data}
        value={emptyFieldOption ? condition.fieldKey : condition.fieldKey || null}
        onChange={(v) => onChange({ ...condition, fieldKey: v ?? '' })}
        searchable
        w={210}
        size={size}
        allowDeselect={false}
      />
      {hasField && (
        <Select
          label="Operador"
          data={Object.values(ConditionOperator).map((op) => ({
            value: op,
            label: operatorLabels[op],
          }))}
          value={condition.operator}
          onChange={(v) => v && onChange({ ...condition, operator: v as ConditionOperator })}
          w={200}
          size={size}
          allowDeselect={false}
        />
      )}
      {hasField && needsValue && (
        <TextInput
          label="Valor"
          value={condition.value}
          onChange={(e) => onChange({ ...condition, value: e.currentTarget.value })}
          w={170}
          size={size}
        />
      )}
    </Group>
  );
}
