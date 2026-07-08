'use client';

import { useMemo, useState } from 'react';
import { Stack, Group, TextInput, Button, Alert, Text, MultiSelect } from '@mantine/core';
import {
  isFieldVisibleForActivity,
  type Activity,
  type ActivityCustomField,
  type Project,
} from '@gen-task/shared';
import { activitiesApi } from '../../services/api/activities.api';
import { contactsApi } from '../../services/api/contacts.api';
import { useAsync } from '../../hooks/useAsync';
import { DynamicField } from './DynamicField';
import { contactLabel } from '../contacts/contact.helpers';

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
  /** Muestra el campo Contactos (ADMIN/SUPER_ADMIN con la funcionalidad activa). */
  contactsEnabled = false,
}: {
  project: Project;
  onCreated: (activity: Activity) => void;
  onCancel: () => void;
  contactsEnabled?: boolean;
}) {
  const [name, setName] = useState('');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Contactos de la organizacion para relacionar con la actividad (solo si la
  // funcionalidad esta activa; se evita la llamada cuando no aplica).
  const { data: contacts } = useAsync(
    () =>
      contactsEnabled
        ? contactsApi.list(project.organizationId)
        : Promise.resolve([]),
    [contactsEnabled, project.organizationId],
  );
  const { data: contactFields } = useAsync(
    () =>
      contactsEnabled
        ? contactsApi.listFields(project.organizationId)
        : Promise.resolve([]),
    [contactsEnabled, project.organizationId],
  );
  const contactOptions = useMemo(
    () =>
      (contacts ?? []).map((c) => ({
        value: c.id,
        label: contactLabel(c, contactFields ?? []),
      })),
    [contacts, contactFields],
  );

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
        ...(contactsEnabled ? { contactIds } : {}),
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

        {contactsEnabled && (
          <MultiSelect
            label="Contactos"
            placeholder={
              contactOptions.length === 0
                ? 'No hay contactos en la organización'
                : 'Relacionar contactos'
            }
            data={contactOptions}
            value={contactIds}
            onChange={setContactIds}
            searchable
            clearable
            disabled={contactOptions.length === 0}
          />
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
