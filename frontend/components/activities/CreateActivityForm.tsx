'use client';

import { useState } from 'react';
import { Stack, Group, TextInput, Button, Alert } from '@mantine/core';
import type { Activity, Project } from '@gen-task/shared';
import { activitiesApi } from '../../services/api/activities.api';

/**
 * Creacion de actividad: solo solicita el nombre. El estado inicial es el
 * estado por defecto del proyecto; los campos personalizados se completan
 * despues en el detalle de la actividad ya creada.
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const activity = await activitiesApi.create(project.id, { name: name.trim() });
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
