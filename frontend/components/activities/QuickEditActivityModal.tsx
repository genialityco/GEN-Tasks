'use client';

import { useState } from 'react';
import { Modal, Stack, Group, Button, Alert, Text } from '@mantine/core';
import { isFieldVisibleForActivity, type Activity, type Project } from '@gen-task/shared';
import { activitiesApi } from '../../services/api/activities.api';
import { DynamicField } from './DynamicField';

/**
 * Edicion rapida de una actividad desde el panel: campos personalizados, sin
 * abrir el detalle completo. La fecha limite ya no se edita a mano: se deriva del
 * cumplimiento por estado (el estado pendiente mas proximo a vencer).
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
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reinicia el formulario cuando cambia la actividad seleccionada.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (activity && loadedFor !== activity.id) {
    setLoadedFor(activity.id);
    setValues(activity.customFieldValues ?? {});
    setError(null);
  }

  const editableFields = project.customFields.filter(
    (f) =>
      f.isActive &&
      !f.isArchived &&
      isFieldVisibleForActivity(f, {
        statusId: activity?.statusId,
        customFieldValues: values,
      }),
  );

  async function save() {
    if (!activity) return;
    setBusy(true);
    setError(null);
    try {
      await activitiesApi.update(activity.id, {
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

          {editableFields.map((field) => (
            <DynamicField
              key={field.id}
              field={field}
              projectId={project.id}
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
