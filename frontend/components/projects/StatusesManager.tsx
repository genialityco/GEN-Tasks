'use client';

import { useState } from 'react';
import {
  Paper,
  Stack,
  Group,
  Text,
  TextInput,
  Select,
  Button,
  ActionIcon,
  Badge,
  Alert,
  Tooltip,
  Modal,
  ColorInput,
} from '@mantine/core';
import { IconPencil, IconCheck, IconX, IconTrash, IconPlus } from '@tabler/icons-react';
import { StatusType, type ProjectStatus } from '@gen-task/shared';
import { projectsApi } from '../../services/api/projects.api';

/** Paleta sugerida de colores para los estados. */
const COLOR_SWATCHES = [
  '#9CA3AF', '#3B82F6', '#10B981', '#F59E0B',
  '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6',
  '#6366F1', '#0EA5E9',
];

const DEFAULT_NEW_COLOR = '#3B82F6';

/**
 * Administra los estados del proyecto: crear (en modal), renombrar, cambiar
 * color, tipo y eliminar. Restringido a ADMIN y SUPER_ADMIN (la pestana de
 * configuracion solo es visible para esos roles y el backend revalida el rol).
 */
export function StatusesManager({
  projectId,
  statuses,
  onChanged,
}: {
  projectId: string;
  statuses: ProjectStatus[];
  onChanged: () => void;
}) {
  // Creacion (modal).
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<StatusType>(StatusType.OPEN);
  const [color, setColor] = useState(DEFAULT_NEW_COLOR);
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // Edicion inline (nombre + color).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(DEFAULT_NEW_COLOR);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await projectsApi.createStatus(projectId, { name: name.trim(), type, color });
      setName('');
      setType(StatusType.OPEN);
      setColor(DEFAULT_NEW_COLOR);
      setCreateOpen(false);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function startRename(status: ProjectStatus) {
    setEditingId(status.id);
    setEditName(status.name);
    setEditColor(status.color ?? DEFAULT_NEW_COLOR);
    setError(null);
  }

  function cancelRename() {
    setEditingId(null);
    setEditName('');
  }

  async function saveRename(statusId: string) {
    const trimmed = editName.trim();
    if (!trimmed) return;
    setSavingId(statusId);
    setError(null);
    try {
      await projectsApi.updateStatus(projectId, statusId, { name: trimmed, color: editColor });
      setEditingId(null);
      setEditName('');
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  async function remove(status: ProjectStatus) {
    if (!confirm(`¿Eliminar el estado "${status.name}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    setSavingId(status.id);
    setError(null);
    try {
      await projectsApi.deleteStatus(projectId, status.id);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  const visible = statuses.filter((s) => !s.isArchived).sort((a, b) => a.order - b.order);

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={700}>Estados</Text>
          <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setCreateOpen(true)}>
            Nuevo estado
          </Button>
        </Group>
        {error && <Alert color="red">{error}</Alert>}

        <Stack gap={6}>
          {visible.map((s) => {
            const isEditing = editingId === s.id;
            return (
              <Group
                key={s.id}
                justify="space-between"
                wrap="nowrap"
                gap="sm"
                p="xs"
                style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}
              >
                {isEditing ? (
                  <Group gap="xs" wrap="nowrap" style={{ flex: 1 }}>
                    <ColorInput
                      value={editColor}
                      onChange={setEditColor}
                      withEyeDropper={false}
                      format="hex"
                      swatches={COLOR_SWATCHES}
                      size="xs"
                      w={120}
                    />
                    <TextInput
                      value={editName}
                      onChange={(e) => setEditName(e.currentTarget.value)}
                      size="xs"
                      style={{ flex: 1 }}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveRename(s.id);
                        if (e.key === 'Escape') cancelRename();
                      }}
                    />
                    <Tooltip label="Guardar" withArrow>
                      <ActionIcon
                        color="green"
                        variant="light"
                        loading={savingId === s.id}
                        onClick={() => saveRename(s.id)}
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
                  <Group gap="xs" wrap="nowrap">
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: s.color ?? '#9CA3AF',
                        display: 'inline-block',
                      }}
                    />
                    <Text>{s.name}</Text>
                    <Badge size="xs" variant="light" color={s.type === StatusType.CLOSED ? 'green' : 'blue'}>
                      {s.type === StatusType.CLOSED ? 'Cerrado' : 'Abierto'}
                    </Badge>
                    {s.isDefault && (
                      <Badge size="xs" variant="light" color="gray">por defecto</Badge>
                    )}
                  </Group>
                )}

                {!isEditing && (
                  <Group gap="xs" wrap="nowrap">
                    <Tooltip label="Editar" withArrow>
                      <ActionIcon variant="subtle" color="blue" onClick={() => startRename(s)}>
                        <IconPencil size={16} />
                      </ActionIcon>
                    </Tooltip>
                    {!s.isDefault && (
                      <Tooltip label="Eliminar" withArrow>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          loading={savingId === s.id}
                          onClick={() => remove(s)}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                )}
              </Group>
            );
          })}
        </Stack>
      </Stack>

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="Nuevo estado" centered>
        <form onSubmit={add}>
          <Stack gap="sm">
            {error && <Alert color="red">{error}</Alert>}
            <TextInput
              label="Nombre del estado"
              placeholder="Ej: En revisión"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              required
              data-autofocus
            />
            <Select
              label="Tipo"
              value={type}
              onChange={(v) => v && setType(v as StatusType)}
              data={[
                { value: StatusType.OPEN, label: 'Abierto' },
                { value: StatusType.CLOSED, label: 'Cerrado' },
              ]}
              allowDeselect={false}
            />
            <ColorInput
              label="Color"
              value={color}
              onChange={setColor}
              format="hex"
              swatches={COLOR_SWATCHES}
              withEyeDropper={false}
            />
            <Group gap="sm" justify="flex-end">
              <Button type="button" variant="default" onClick={() => setCreateOpen(false)} disabled={busy}>
                Cancelar
              </Button>
              <Button type="submit" loading={busy}>Agregar</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Paper>
  );
}
