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
import { IconTrash, IconPlus, IconPencil, IconCheck, IconX } from '@tabler/icons-react';
import { CustomFieldType, type ActivityCustomField } from '@gen-task/shared';
import { projectsApi } from '../../services/api/projects.api';

const TYPE_LABELS: Record<CustomFieldType, string> = {
  TEXT: 'Texto',
  NUMBER: 'Numero',
  DATE: 'Fecha',
  FILE: 'Archivo',
  IMAGE: 'Imagen',
  VIDEO: 'Video',
  LIST: 'Lista',
};

/**
 * Administra los campos personalizados del proyecto. Para tipo LISTA permite
 * definir opciones. El tipo no se puede cambiar una vez creado (regla de dominio).
 * Crear y eliminar estan restringidos a ADMIN y SUPER_ADMIN (pestana de
 * configuracion + revalidacion de rol en el backend).
 */
export function CustomFieldsManager({
  projectId,
  fields,
  onChanged,
}: {
  projectId: string;
  fields: ActivityCustomField[];
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

  // Renombrado inline (solo el nombre/label; la `key` permanece estable).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  function startRename(field: ActivityCustomField) {
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
      await projectsApi.updateCustomField(projectId, fieldId, { label: trimmed });
      setEditingId(null);
      setEditLabel('');
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingId(null);
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
      await projectsApi.createCustomField(projectId, {
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

  async function remove(field: ActivityCustomField) {
    if (!confirm(`¿Eliminar el campo "${field.label}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    setDeletingId(field.id);
    setError(null);
    try {
      await projectsApi.deleteCustomField(projectId, field.id);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  const visible = fields.filter((f) => !f.isArchived).sort((a, b) => a.order - b.order);

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={700}>Campos personalizados</Text>
          <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setCreateOpen(true)}>
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
              style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}
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
                    <ActionIcon color="green" variant="light" loading={savingId === f.id} onClick={() => saveRename(f.id)}>
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
                <Group gap="xs" wrap="nowrap">
                  <Text>{f.label}</Text>
                  <Badge size="xs" variant="light" color="blue">{TYPE_LABELS[f.type]}</Badge>
                  {f.required && (
                    <Badge size="xs" variant="light" color="red">obligatorio</Badge>
                  )}
                  {!!f.options?.length && (
                    <Badge size="xs" variant="light" color="gray">{f.options.length} opciones</Badge>
                  )}
                </Group>
              )}

              {!isEditing && (
                <Group gap="xs" wrap="nowrap">
                  <Tooltip label="Renombrar" withArrow>
                    <ActionIcon variant="subtle" color="blue" onClick={() => startRename(f)}>
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
            <Text c="dimmed" size="sm">Sin campos personalizados.</Text>
          )}
        </Stack>
      </Stack>

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="Nuevo campo personalizado" centered>
        <form onSubmit={add}>
          <Stack gap="sm">
            {error && <Alert color="red">{error}</Alert>}
            <TextInput
              label="Etiqueta del campo"
              placeholder="Ej: Tipo de falla"
              value={label}
              onChange={(e) => setLabel(e.currentTarget.value)}
              required
              data-autofocus
            />
            <Select
              label="Tipo"
              value={type}
              onChange={(v) => v && setType(v as CustomFieldType)}
              data={(Object.keys(TYPE_LABELS) as CustomFieldType[]).map((t) => ({
                value: t,
                label: TYPE_LABELS[t],
              }))}
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
                placeholder="Opciones separadas por coma (ej: Electrico, Fisico, Software)"
                value={optionsText}
                onChange={(e) => setOptionsText(e.currentTarget.value)}
              />
            )}
            <Group gap="sm" justify="flex-end">
              <Button type="button" variant="default" onClick={() => setCreateOpen(false)} disabled={busy}>
                Cancelar
              </Button>
              <Button type="submit" loading={busy}>Agregar campo</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Paper>
  );
}
