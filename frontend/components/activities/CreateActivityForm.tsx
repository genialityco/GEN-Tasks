'use client';

import { useMemo, useState } from 'react';
import { Stack, Group, TextInput, Button, Alert, Text } from '@mantine/core';
import {
  isFieldVisibleForActivity,
  type Activity,
  type ActivityCustomField,
  type Project,
} from '@gen-task/shared';
import { activitiesApi } from '../../services/api/activities.api';
import { DynamicField } from './DynamicField';

/** Estado inicial (por defecto) del proyecto, igual que lo resuelve el backend. */
function defaultStatusId(project: Project): string | undefined {
  const active = project.statuses
    .filter((s) => s.isActive && !s.isArchived)
    .sort((a, b) => a.order - b.order);
  return (active.find((s) => s.isDefault) ?? active[0])?.id;
}

/**
 * Creacion de actividad: solicita el nombre y los campos obligatorios (globales
 * o requeridos en el estado inicial), ya que el backend los exige al guardar.
 * El resto de campos personalizados se completan luego en el detalle.
 */
export function CreateActivityForm({
  project,
  onCreated,
  onCancel,
}: {
  project: Project;
  onCreated: (activity: Activity) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Campos obligatorios para el estado inicial: required global o requerido en
  // el estado por defecto del proyecto.
  const requiredFields = useMemo<ActivityCustomField[]>(() => {
    const initialStatus = defaultStatusId(project);
    return project.customFields
      .filter((f) => f.isActive && !f.isArchived)
      .filter(
        (f) =>
          f.required ||
          (initialStatus != null &&
            (f.requiredOnStatuses ?? []).includes(initialStatus)),
      )
      .sort((a, b) => a.order - b.order);
  }, [project]);

  // Solo se muestran los campos cuya visibilidad condicional se cumple con los
  // valores ya ingresados (se reevalua al cambiar el formulario).
  const visibleRequiredFields = requiredFields.filter((f) =>
    isFieldVisibleForActivity(f, {
      statusId: defaultStatusId(project),
      customFieldValues: values,
    }),
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const activity = await activitiesApi.create(project.id, {
        name: name.trim(),
        customFieldValues: values,
      });
      onCreated(activity);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Stack gap="sm">
        {error && <Alert color="red">{error}</Alert>}
        <TextInput
          label="Nombre de la actividad"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
          data-autofocus
        />

        {visibleRequiredFields.length > 0 && (
          <>
            <Text size="sm" c="dimmed">
              Campos obligatorios
            </Text>
            {visibleRequiredFields.map((field) => (
              <DynamicField
                key={field.id}
                field={field}
                projectId={project.id}
                value={values[field.key]}
                onChange={(v) =>
                  setValues((prev) => ({ ...prev, [field.key]: v }))
                }
              />
            ))}
          </>
        )}

        <Group gap="sm" justify="flex-end">
          <Button type="button" variant="default" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" loading={busy}>Crear actividad</Button>
        </Group>
      </Stack>
    </form>
  );
}
