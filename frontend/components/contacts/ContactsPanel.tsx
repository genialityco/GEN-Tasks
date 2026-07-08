'use client';

import { useMemo, useState } from 'react';
import {
  Paper,
  Stack,
  Group,
  Text,
  TextInput,
  NumberInput,
  Select,
  Button,
  ActionIcon,
  Alert,
  Table,
  Tooltip,
  Modal,
  Loader,
} from '@mantine/core';
import { IconPlus, IconTrash, IconPencil } from '@tabler/icons-react';
import {
  CustomFieldType,
  type Contact,
  type ContactCustomField,
} from '@gen-task/shared';
import { contactsApi } from '../../services/api/contacts.api';
import { useContacts } from '../../hooks/useContacts';
import { contactValueText } from './contact.helpers';

/** Formulario dinamico de un campo segun su tipo. */
function FieldInput({
  field,
  value,
  onChange,
}: {
  field: ContactCustomField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const common = { label: field.label, required: field.required };
  switch (field.type) {
    case CustomFieldType.NUMBER:
      return (
        <NumberInput
          {...common}
          value={value === undefined || value === null ? '' : (value as number)}
          onChange={(v) => onChange(v === '' ? undefined : v)}
        />
      );
    case CustomFieldType.DATE:
      return (
        <TextInput
          {...common}
          type="date"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.currentTarget.value || undefined)}
        />
      );
    case CustomFieldType.LIST:
      return (
        <Select
          {...common}
          data={(field.options ?? [])
            .filter((o) => o.isActive)
            .map((o) => ({ value: o.value, label: o.label }))}
          value={(value as string) ?? null}
          onChange={(v) => onChange(v ?? undefined)}
          clearable
          searchable
        />
      );
    default:
      return (
        <TextInput
          {...common}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.currentTarget.value || undefined)}
        />
      );
  }
}

/**
 * Tabla de contactos de la organizacion con formulario dinamico basado en los
 * campos definidos. La asociacion a proyectos se hace desde las actividades, no
 * aqui.
 */
export function ContactsPanel({
  organizationId,
  fields,
}: {
  organizationId: string;
  fields: ContactCustomField[];
}) {
  const { data: contacts, loading, error, reload } = useContacts(organizationId);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const activeFields = useMemo(
    () =>
      fields
        .filter((f) => !f.isArchived && f.isActive)
        .sort((a, b) => a.order - b.order),
    [fields],
  );

  function openCreate() {
    setEditing(null);
    setValues({});
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(contact: Contact) {
    setEditing(contact);
    setValues({ ...contact.values });
    setFormError(null);
    setModalOpen(true);
  }

  async function save() {
    setBusy(true);
    setFormError(null);
    try {
      if (editing) {
        await contactsApi.update(organizationId, editing.id, { values });
      } else {
        await contactsApi.create(organizationId, { values });
      }
      setModalOpen(false);
      reload();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(contact: Contact) {
    if (!confirm('¿Eliminar este contacto?')) return;
    setDeletingId(contact.id);
    try {
      await contactsApi.remove(organizationId, contact.id);
      reload();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={700}>Contactos</Text>
          <Button
            size="xs"
            leftSection={<IconPlus size={14} />}
            onClick={openCreate}
            disabled={activeFields.length === 0}
          >
            Nuevo contacto
          </Button>
        </Group>

        {activeFields.length === 0 && (
          <Alert color="blue" variant="light">
            Primero define los campos del contacto en la pestaña “Campos”.
          </Alert>
        )}
        {error && <Alert color="red">{error}</Alert>}
        {loading && <Loader size="sm" />}

        {!loading && contacts && contacts.length > 0 && (
          <Table.ScrollContainer minWidth={400}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  {activeFields.map((f) => (
                    <Table.Th key={f.id}>{f.label}</Table.Th>
                  ))}
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {contacts.map((c) => (
                  <Table.Tr key={c.id}>
                    {activeFields.map((f) => (
                      <Table.Td key={f.id}>
                        {contactValueText(f, c.values?.[f.key]) || '—'}
                      </Table.Td>
                    ))}
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap" justify="flex-end">
                        <Tooltip label="Editar" withArrow>
                          <ActionIcon
                            variant="subtle"
                            color="blue"
                            onClick={() => openEdit(c)}
                          >
                            <IconPencil size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Eliminar" withArrow>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            loading={deletingId === c.id}
                            onClick={() => remove(c)}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}

        {!loading && contacts && contacts.length === 0 && activeFields.length > 0 && (
          <Text c="dimmed" size="sm">
            Aún no hay contactos. Crea uno o importa desde Excel.
          </Text>
        )}
      </Stack>

      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar contacto' : 'Nuevo contacto'}
        centered
        size="lg"
      >
        <Stack gap="sm">
          {formError && <Alert color="red">{formError}</Alert>}
          {activeFields.map((f) => (
            <FieldInput
              key={f.id}
              field={f}
              value={values[f.key]}
              onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
            />
          ))}
          <Group gap="sm" justify="flex-end" mt="xs">
            <Button
              variant="default"
              onClick={() => setModalOpen(false)}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button onClick={save} loading={busy}>
              {editing ? 'Guardar cambios' : 'Crear contacto'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}
