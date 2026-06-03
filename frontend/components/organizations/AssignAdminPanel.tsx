'use client';

import { useState } from 'react';
import {
  Paper,
  Stack,
  Group,
  Text,
  TextInput,
  Button,
  ActionIcon,
  Badge,
  Alert,
  Tooltip,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import type { Organization } from '@gen-task/shared';
import { usersApi } from '../../services/api/users.api';
import { organizationsApi } from '../../services/api/organizations.api';
import { useAsync } from '../../hooks/useAsync';

/**
 * Asigna y quita administradores de la organizacion (solo SUPER_ADMIN). Usa el
 * endpoint find-or-create para asignar (idempotente) y un DELETE para quitar.
 */
export function AssignAdminPanel({
  organization,
  onChanged,
}: {
  organization: Organization;
  onChanged: () => void;
}) {
  const { data: users, reload: reloadUsers } = useAsync(() => usersApi.list(), []);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function assign(emailValue: string, nameValue: string) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await organizationsApi.assignAdmin(organization.id, {
        email: emailValue.trim(),
        name: nameValue.trim(),
      });
      setEmail('');
      setName('');
      setOk('Administrador asignado.');
      reloadUsers();
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId: string) {
    if (!confirm('¿Quitar este administrador de la organización?')) return;
    setRemovingId(userId);
    setError(null);
    setOk(null);
    try {
      await organizationsApi.removeAdmin(organization.id, userId);
      setOk('Administrador removido.');
      reloadUsers();
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRemovingId(null);
    }
  }

  const userById = (id: string) => (users ?? []).find((u) => u.id === id);
  const admins = organization.admins;
  const nonAdmins = (users ?? []).filter(
    (u) => !organization.admins.includes(u.id) && !u.globalRole,
  );

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Text fw={700}>Administradores ({admins.length})</Text>
        {error && <Alert color="red">{error}</Alert>}
        {ok && <Alert color="green">{ok}</Alert>}

        {/* Administradores actuales */}
        <Stack gap={6}>
          {admins.map((id) => {
            const u = userById(id);
            return (
              <Group
                key={id}
                justify="space-between"
                wrap="nowrap"
                gap="sm"
                p="xs"
                style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}
              >
                <Group gap="xs" wrap="nowrap">
                  <Text>{u?.name ?? id}</Text>
                  {u?.email && <Text size="sm" c="dimmed">{u.email}</Text>}
                  <Badge size="xs" variant="light" color="blue">Admin</Badge>
                </Group>
                <Tooltip label="Quitar administrador" withArrow>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    loading={removingId === id}
                    onClick={() => remove(id)}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            );
          })}
          {admins.length === 0 && (
            <Text c="dimmed" size="sm">No hay administradores asignados.</Text>
          )}
        </Stack>

        {/* Asignar nuevo admin por correo */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            assign(email, name);
          }}
        >
          <Stack gap="xs">
            <Text size="sm" c="dimmed">Asignar admin por correo (lo crea si no existe):</Text>
            <Group gap="sm" wrap="wrap" align="flex-end">
              <TextInput
                placeholder="Correo"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                required
                style={{ flex: 1, minWidth: 160 }}
              />
              <TextInput
                placeholder="Nombre"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                required
                style={{ flex: 1, minWidth: 160 }}
              />
              <Button type="submit" loading={busy}>Asignar</Button>
            </Group>
          </Stack>
        </form>

        {/* Asignar un usuario existente */}
        {nonAdmins.length > 0 && (
          <Stack gap={6}>
            <Text size="sm" c="dimmed">O asignar un usuario existente:</Text>
            {nonAdmins.slice(0, 8).map((u) => (
              <Group key={u.id} justify="space-between" wrap="nowrap">
                <Text>
                  {u.name} <Text span size="sm" c="dimmed">({u.email})</Text>
                </Text>
                <Button
                  size="xs"
                  variant="light"
                  disabled={busy}
                  onClick={() => assign(u.email, u.name)}
                >
                  + Admin
                </Button>
              </Group>
            ))}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
