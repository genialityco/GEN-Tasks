'use client';

import { TextInput, NumberInput, Select } from '@mantine/core';
import { CustomFieldType, type ActivityCustomField } from '@gen-task/shared';

/** Input dinamico para un campo personalizado segun su tipo. */
export function DynamicField({
  field,
  value,
  onChange,
}: {
  field: ActivityCustomField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = `${field.label}${field.required ? ' *' : ''}`;

  if (field.type === CustomFieldType.LIST) {
    return (
      <Select
        label={label}
        placeholder="Seleccionar..."
        value={(value as string) ?? null}
        onChange={(v) => onChange(v ?? undefined)}
        data={(field.options ?? [])
          .filter((o) => o.isActive)
          .map((o) => ({ value: o.value, label: o.label }))}
        clearable
      />
    );
  }
  if (field.type === CustomFieldType.NUMBER) {
    return (
      <NumberInput
        label={label}
        value={(value as number) ?? ''}
        onChange={(v) => onChange(v === '' ? undefined : Number(v))}
      />
    );
  }
  if (field.type === CustomFieldType.DATE) {
    return (
      <TextInput
        label={label}
        type="date"
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
    );
  }
  return (
    <TextInput
      label={label}
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  );
}
