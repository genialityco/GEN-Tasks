'use client';

import { TextInput, NumberInput, Select } from '@mantine/core';
import {
  CustomFieldType,
  type ActivityCustomField,
  type ActivityFileAttachment,
} from '@gen-task/shared';
import { FileFieldUploader } from './FileFieldUploader';

const FILE_TYPES: CustomFieldType[] = [
  CustomFieldType.FILE,
  CustomFieldType.IMAGE,
  CustomFieldType.VIDEO,
];

/**
 * Normaliza el tipo del campo al valor canonico del enum. Defensivo ante datos
 * heredados o creados por otras vias (p. ej. distinto casing o espacios), para
 * que cada tipo se mapee siempre a su input correcto y no caiga al de texto.
 */
export function normalizeType(type: unknown): CustomFieldType | null {
  const raw = String(type ?? '').trim().toUpperCase();
  return (Object.values(CustomFieldType) as string[]).includes(raw)
    ? (raw as CustomFieldType)
    : null;
}

/** Input dinamico para un campo personalizado segun su tipo. */
export function DynamicField({
  field,
  value,
  onChange,
  projectId,
}: {
  field: ActivityCustomField;
  value: unknown;
  onChange: (v: unknown) => void;
  /** Requerido para los campos de archivo (FILE/IMAGE/VIDEO) que suben al proyecto. */
  projectId?: string;
}) {
  const type = normalizeType(field.type);
  const label = `${field.label}${field.required ? ' *' : ''}`;

  if (type && FILE_TYPES.includes(type)) {
    if (!projectId) return null;
    return (
      <FileFieldUploader
        projectId={projectId}
        type={type}
        label={label}
        value={value}
        onChange={(v: ActivityFileAttachment[] | undefined) => onChange(v)}
      />
    );
  }

  switch (type) {
    case CustomFieldType.LIST:
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

    case CustomFieldType.NUMBER:
      return (
        <NumberInput
          label={label}
          value={(value as number) ?? ''}
          onChange={(v) => onChange(v === '' ? undefined : Number(v))}
        />
      );

    case CustomFieldType.DATE:
      return (
        <TextInput
          label={label}
          type="date"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      );

    case CustomFieldType.TEXT:
    default:
      return (
        <TextInput
          label={label}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      );
  }
}
