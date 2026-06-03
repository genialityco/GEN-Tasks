'use client';

import { useState } from 'react';
import { Select, TextInput, NumberInput, Loader, Group } from '@mantine/core';
import {
  CustomFieldType,
  type Activity,
  type Project,
} from '@gen-task/shared';
import { activitiesApi } from '../../services/api/activities.api';
import { normalizeType } from './DynamicField';

/** Tipos de campo de archivo, no editables inline. */
export const FILE_FIELD_TYPES = [
  CustomFieldType.FILE,
  CustomFieldType.IMAGE,
  CustomFieldType.VIDEO,
];

/** Indica si un campo es de archivo (FILE/IMAGE/VIDEO), tolerante a variaciones de tipo. */
export function isFileField(type: unknown): boolean {
  const t = normalizeType(type);
  return t != null && FILE_FIELD_TYPES.includes(t);
}

/** Columnas base editables inline (las demas se editan en el modal o no se editan). */
export function isInlineEditableColumn(
  columnKey: string,
  project: Project,
): boolean {
  if (columnKey === 'status' || columnKey === 'name' || columnKey === 'scheduledDate') {
    return true;
  }
  if (columnKey.startsWith('cf_')) {
    const field = project.customFields.find((f) => f.key === columnKey.slice(3));
    return !!field && !isFileField(field.type);
  }
  return false;
}

/**
 * Editor inline de una celda de la tabla de actividades. Guarda al confirmar
 * (Enter / cambio de Select / blur) y cancela con Escape. Llama a `onDone` con
 * un mensaje de error si la API rechaza el cambio (restriccion, flujo lineal,
 * campo obligatorio, etc.).
 */
export function InlineCellEditor({
  activity,
  project,
  columnKey,
  onDone,
}: {
  activity: Activity;
  project: Project;
  columnKey: string;
  onDone: (error?: string, changed?: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'date' | 'hours'>('date');

  async function commit(fn: () => Promise<unknown>, unchanged: boolean) {
    if (unchanged) {
      onDone(undefined, false);
      return;
    }
    setBusy(true);
    try {
      await fn();
      onDone(undefined, true);
    } catch (err) {
      onDone((err as Error).message, false);
    } finally {
      setBusy(false);
    }
  }

  if (busy) {
    return (
      <Group gap={6} wrap="nowrap">
        <Loader size="xs" />
      </Group>
    );
  }

  // --- Estado ---
  if (columnKey === 'status') {
    const statuses = project.statuses
      .filter((s) => s.isActive && !s.isArchived)
      .sort((a, b) => a.order - b.order);
    return (
      <Select
        size="xs"
        autoFocus
        defaultDropdownOpened
        allowDeselect={false}
        value={activity.statusId}
        data={statuses.map((s) => ({ value: s.id, label: s.name }))}
        onChange={(v) =>
          commit(
            () => activitiesApi.changeStatus(activity.id, v as string),
            !v || v === activity.statusId,
          )
        }
        onKeyDown={(e) => e.key === 'Escape' && onDone()}
        comboboxProps={{ withinPortal: true }}
      />
    );
  }

  // --- Nombre ---
  if (columnKey === 'name') {
    return (
      <InlineText
        initial={activity.name}
        onCommit={(val) =>
          commit(
            () => activitiesApi.update(activity.id, { name: val }),
            val.trim() === '' || val === activity.name,
          )
        }
        onCancel={onDone}
      />
    );
  }

  // --- Programacion ---
  if (columnKey === 'scheduledDate') {
    const initial = activity.scheduledDate ? activity.scheduledDate.slice(0, 10) : '';
    // Modo: fecha exacta o horas desde createdAt
    return (
      <Group gap={6} wrap="nowrap">
        <Select
          size="xs"
          value={mode}
          data={[{ value: 'date', label: 'Fecha' }, { value: 'hours', label: 'Horas desde creación' }]}
          onChange={(v) => setMode((v as 'date' | 'hours') ?? 'date')}
        />
        {mode === 'date' ? (
          <InlineText
            type="date"
            initial={initial}
            onCommit={(val) =>
              commit(
                () =>
                  // Construir Date en hora local para evitar desfases de zona horaria
                  (async () => {
                    if (!val) return activitiesApi.update(activity.id, { scheduledDate: undefined });
                    const [y, m, d] = val.split('-').map((s) => Number(s));
                    const local = new Date(y, m - 1, d);
                    return activitiesApi.update(activity.id, { scheduledDate: local.toISOString() });
                  })(),
                val === initial,
              )
            }
            onCancel={onDone}
          />
        ) : (
          <InlineNumber
            initial={undefined}
            onCommit={(hours) => {
              if (hours == null) {
                commit(() => activitiesApi.update(activity.id, { scheduledDate: undefined }), false);
                return;
              }
              const created = new Date(activity.createdAt);
              const target = new Date(created.getTime() + Math.round(Number(hours)) * 3600 * 1000);
              commit(() => activitiesApi.update(activity.id, { scheduledDate: target.toISOString() }), false);
            }}
            onCancel={onDone}
          />
        )}
      </Group>
    );
  }

  // --- Campos personalizados ---
  if (columnKey.startsWith('cf_')) {
    const field = project.customFields.find((f) => f.key === columnKey.slice(3));
    if (!field) {
      onDone();
      return null;
    }
    const fieldType = normalizeType(field.type);
    const current = activity.customFieldValues?.[field.key];
    const saveValue = (v: unknown, unchanged: boolean) =>
      commit(
        () =>
          activitiesApi.update(activity.id, {
            customFieldValues: { [field.key]: v },
          }),
        unchanged,
      );

    if (fieldType === CustomFieldType.LIST) {
      return (
        <Select
          size="xs"
          autoFocus
          defaultDropdownOpened
          clearable
          value={(current as string) ?? null}
          data={(field.options ?? [])
            .filter((o) => o.isActive)
            .map((o) => ({ value: o.value, label: o.label }))}
          onChange={(v) => saveValue(v ?? undefined, (v ?? undefined) === current)}
          onKeyDown={(e) => e.key === 'Escape' && onDone()}
          comboboxProps={{ withinPortal: true }}
        />
      );
    }
    if (fieldType === CustomFieldType.NUMBER) {
      return (
        <InlineNumber
          initial={typeof current === 'number' ? current : undefined}
          onCommit={(v) => saveValue(v, v === current)}
          onCancel={onDone}
        />
      );
    }
    // TEXT y DATE usan input de texto/fecha.
    return (
      <InlineText
        type={fieldType === CustomFieldType.DATE ? 'date' : 'text'}
        initial={current == null ? '' : String(current)}
        onCommit={(val) =>
          saveValue(val === '' ? undefined : val, val === (current == null ? '' : String(current)))
        }
        onCancel={onDone}
      />
    );
  }

  onDone();
  return null;
}

/** Input de texto/fecha que confirma con Enter o blur y cancela con Escape. */
function InlineText({
  initial,
  type = 'text',
  onCommit,
  onCancel,
}: {
  initial: string;
  type?: 'text' | 'date';
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <TextInput
      size="xs"
      type={type}
      autoFocus
      value={value}
      onChange={(e) => setValue(e.currentTarget.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(value);
        if (e.key === 'Escape') onCancel();
      }}
    />
  );
}

/** Input numerico que confirma con Enter o blur y cancela con Escape. */
function InlineNumber({
  initial,
  onCommit,
  onCancel,
}: {
  initial?: number;
  onCommit: (value: number | undefined) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState<number | string>(initial ?? '');
  const parsed = value === '' ? undefined : Number(value);
  return (
    <NumberInput
      size="xs"
      autoFocus
      value={value}
      onChange={setValue}
      onBlur={() => onCommit(parsed)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(parsed);
        if (e.key === 'Escape') onCancel();
      }}
    />
  );
}
