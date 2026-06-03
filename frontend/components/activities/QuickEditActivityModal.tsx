'use client';

import { useState } from 'react';
import { Modal, Stack, Group, Button, TextInput, Alert, Text } from '@mantine/core';
import { CustomFieldType, type Activity, type Project } from '@gen-task/shared';
import { activitiesApi } from '../../services/api/activities.api';
import { DynamicField } from './DynamicField';

/**
 * Edicion rapida de una actividad desde el panel: programacion (fecha limite)
 * y campos personalizados, sin abrir el detalle completo.
 */
export function QuickEditActivityModal({
  activity,
  project,
  onClose,
  onSaved,
}: {
  activity: Activity | null;
  project: Project;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [scheduledDate, setScheduledDate] = useState('');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reinicia el formulario cuando cambia la actividad seleccionada.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (activity && loadedFor !== activity.id) {
    setLoadedFor(activity.id);
    setScheduledDate(activity.scheduledDate ? activity.scheduledDate.slice(0, 10) : '');
    setValues(activity.customFieldValues ?? {});
    setError(null);
  }

  const editableFields = project.customFields.filter(
    (f) =>
      f.isActive &&
      !f.isArchived &&
      ![CustomFieldType.FILE, CustomFieldType.IMAGE, CustomFieldType.VIDEO].includes(f.type),
  );

  async function save() {
    if (!activity) return;
    setBusy(true);
    setError(null);
    try {
      await activitiesApi.update(activity.id, {
        scheduledDate: scheduledDate ? new Date(scheduledDate).toISOString() : undefined,
        customFieldValues: values,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal opened={!!activity} onClose={onClose} title="Editar actividad" centered>
      {activity && (
        <Stack gap="sm">
          {error && <Alert color="red">{error}</Alert>}
          <Text fw={600}>{activity.name}</Text>

          <TextInput
            label="Programación (fecha límite)"
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.currentTarget.value)}
          />

          {editableFields.map((field) => (
            <DynamicField
              key={field.id}
              field={field}
              value={values[field.key]}
              onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
            />
          ))}

          <Group gap="sm" justify="flex-end">
            <Button variant="default" onClick={onClose} disabled={busy}>Cancelar</Button>
            <Button onClick={save} loading={busy}>Guardar</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
