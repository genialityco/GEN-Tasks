'use client';

import { useState } from 'react';
import {
  Paper,
  Stack,
  Group,
  Text,
  TextInput,
  Select,
  Checkbox,
  Button,
  ActionIcon,
  Badge,
  Alert,
  Tooltip,
  Modal,
} from '@mantine/core';
import {
  IconTrash,
  IconPlus,
  IconPencil,
  IconCheck,
  IconX,
  IconList,
} from '@tabler/icons-react';
import { CustomFieldType, type ContactCustomField } from '@gen-task/shared';
import { contactsApi } from '../../services/api/contacts.api';

/** Tipos de dato disponibles para un campo de contacto. */
const CONTACT_TYPE_LABELS: Partial<Record<CustomFieldType, string>> = {
  [CustomFieldType.TEXT]: 'Texto',
  [CustomFieldType.NUMBER]: 'Numero',
  [CustomFieldType.DATE]: 'Fecha',
  [CustomFieldType.LIST]: 'Lista',
  [CustomFieldType.LINK]: 'Enlace',
};

const CONTACT_TYPES = Object.keys(CONTACT_TYPE_LABELS) as CustomFieldType[];

const typeLabel = (t: CustomFieldType) => CONTACT_TYPE_LABELS[t] ?? t;

/**
 * Administra los campos que tendran los contactos de la organizacion. El ADMIN
 * define, por campo, su etiqueta, tipo (texto, numero, fecha, lista, enlace) y
 * si es obligatorio. El tipo no se puede cambiar una vez creado (regla de
 * dominio); para cambiarlo se crea un campo nuevo.
 */
export function ContactFieldsManager({
  organizationId,
  fields,
  onChanged,
}: {
  organizationId: string;
  fields: ContactCustomField[];
  onChanged: () => void;
}) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<CustomFieldType>(CustomFieldType.TEXT);
  const [required, setRequired] = useState(false);
  const [optionsText, setOptionsText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Renombrado inline.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  // Edicion de opciones de un campo LIST.
  const [optionsField, setOptionsField] = useState<ContactCustomField | null>(null);
  const [optionsDraft, setOptionsDraft] = useState('');
  const [optionsBusy, setOptionsBusy] = useState(false);

  function startRename(field: ContactCustomField) {
    setEditingId(field.id);
    setEditLabel(field.label);
    setError(null);
  }

  function cancelRename() {
    setEditingId(null);
    setEditLabel('');
  }

  async function saveRename(fieldId: string) {
    const trimmed = editLabel.trim();
    if (!trimmed) return;
    setSavingId(fieldId);
    setError(null);
    try {
      await contactsApi.updateField(organizationId, fieldId, { label: trimmed });
      setEditingId(null);
      setEditLabel('');
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  function openOptions(field: ContactCustomField) {
    setOptionsField(field);
    setOptionsDraft((field.options ?? []).map((o) => o.label).join(', '));
    setError(null);
  }

  async function saveOptions() {
    if (!optionsField) return;
    setOptionsBusy(true);
    setError(null);
    try {
      const options = optionsDraft
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
        .map((o) => ({ label: o, value: o }));
      await contactsApi.updateField(organizationId, optionsField.id, { options });
      setOptionsField(null);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setOptionsBusy(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const options =
        type === CustomFieldType.LIST
          ? optionsText
              .split(',')
              .map((o) => o.trim())
              .filter(Boolean)
              .map((o) => ({ label: o, value: o }))
          : undefined;
      await contactsApi.createField(organizationId, {
        label: label.trim(),
        type,
        required,
        options,
      });
      setLabel('');
      setOptionsText('');
      setRequired(false);
      setType(CustomFieldType.TEXT);
      setCreateOpen(false);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(field: ContactCustomField) {
    if (
      !confirm(
        `¿Eliminar el campo "${field.label}"? Los contactos conservan el dato guardado pero dejará de mostrarse.`,
      )
    ) {
      return;
    }
    setDeletingId(field.id);
    setError(null);
    try {
      await contactsApi.deleteField(organizationId, field.id);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  const visible = fields
    .filter((f) => !f.isArchived)
    .sort((a, b) => a.order - b.order);

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={700}>Campos del contacto</Text>
          <Button
            size="xs"
            leftSection={<IconPlus size={14} />}
            onClick={() => setCreateOpen(true)}
          >
            Nuevo campo
          </Button>
        </Group>
        {error && <Alert color="red">{error}</Alert>}

        <Stack gap={6}>
          {visible.map((f) => {
            const isEditing = editingId === f.id;
            return (
              <Group
                key={f.id}
                justify="space-between"
                wrap="nowrap"
                gap="sm"
                p="xs"
                style={{
                  border: '1px solid var(--mantine-color-gray-3)',
                  borderRadius: 6,
                }}
              >
                {isEditing ? (
                  <Group gap="xs" wrap="nowrap" style={{ flex: 1 }}>
                    <TextInput
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.currentTarget.value)}
                      size="xs"
                      style={{ flex: 1 }}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveRename(f.id);
                        if (e.key === 'Escape') cancelRename();
                      }}
                    />
                    <Tooltip label="Guardar" withArrow>
                      <ActionIcon
                        color="green"
                        variant="light"
                        loading={savingId === f.id}
                        onClick={() => saveRename(f.id)}
                      >
                        <IconCheck size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Cancelar" withArrow>
                      <ActionIcon color="gray" variant="light" onClick={cancelRename}>
                        <IconX size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                ) : (
                  <Group gap="xs" wrap="wrap">
                    <Text>{f.label}</Text>
                    <Badge size="xs" variant="light" color="blue">
                      {typeLabel(f.type)}
                    </Badge>
                    {f.required && (
                      <Badge size="xs" variant="light" color="red">
                        obligatorio
                      </Badge>
                    )}
                    {!!f.options?.length && (
                      <Badge size="xs" variant="light" color="gray">
                        {f.options.length} opciones
                      </Badge>
                    )}
                  </Group>
                )}

                {!isEditing && (
                  <Group gap="xs" wrap="nowrap">
                    {f.type === CustomFieldType.LIST && (
                      <Tooltip label="Editar opciones" withArrow>
                        <ActionIcon
                          variant="subtle"
                          color="teal"
                          onClick={() => openOptions(f)}
                        >
                          <IconList size={16} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    <Tooltip label="Renombrar" withArrow>
                      <ActionIcon
                        variant="subtle"
                        color="blue"
                        onClick={() => startRename(f)}
                      >
                        <IconPencil size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Eliminar" withArrow>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        loading={deletingId === f.id}
                        onClick={() => remove(f)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                )}
              </Group>
            );
          })}
          {visible.length === 0 && (
            <Text c="dimmed" size="sm">
              Aún no has definido campos. Crea los datos que tendrán tus contactos.
            </Text>
          )}
        </Stack>
      </Stack>

      {/* Crear campo */}
      <Modal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nuevo campo del contacto"
        centered
      >
        <form onSubmit={add}>
          <Stack gap="sm">
            {error && <Alert color="red">{error}</Alert>}
            <TextInput
              label="Nombre del campo"
              placeholder="Ej: Correo, Teléfono, Ciudad"
              value={label}
              onChange={(e) => setLabel(e.currentTarget.value)}
              required
              data-autofocus
            />
            <Select
              label="Tipo de dato"
              value={type}
              onChange={(v) => v && setType(v as CustomFieldType)}
              data={CONTACT_TYPES.map((t) => ({ value: t, label: typeLabel(t) }))}
              allowDeselect={false}
            />
            <Checkbox
              label="Obligatorio"
              checked={required}
              onChange={(e) => setRequired(e.currentTarget.checked)}
            />
            {type === CustomFieldType.LIST && (
              <TextInput
                label="Opciones"
                placeholder="Opciones separadas por coma (ej: Activo, Inactivo)"
                value={optionsText}
                onChange={(e) => setOptionsText(e.currentTarget.value)}
              />
            )}
            <Group gap="sm" justify="flex-end" mt="xs">
              <Button
                type="button"
                variant="default"
                onClick={() => setCreateOpen(false)}
                disabled={busy}
              >
                Cancelar
              </Button>
              <Button type="submit" loading={busy}>
                Agregar campo
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Editar opciones de un campo LIST */}
      <Modal
        opened={!!optionsField}
        onClose={() => setOptionsField(null)}
        title={optionsField ? `Opciones de “${optionsField.label}”` : ''}
        centered
      >
        <Stack gap="sm">
          {error && <Alert color="red">{error}</Alert>}
          <TextInput
            label="Opciones"
            placeholder="Opciones separadas por coma"
            value={optionsDraft}
            onChange={(e) => setOptionsDraft(e.currentTarget.value)}
            data-autofocus
          />
          <Group gap="sm" justify="flex-end" mt="xs">
            <Button
              variant="default"
              onClick={() => setOptionsField(null)}
              disabled={optionsBusy}
            >
              Cancelar
            </Button>
            <Button onClick={saveOptions} loading={optionsBusy}>
              Guardar opciones
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}
