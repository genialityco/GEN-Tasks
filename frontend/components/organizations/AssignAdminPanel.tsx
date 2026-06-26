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
  Modal,
  PasswordInput,
} from '@mantine/core';
import { IconTrash, IconPencil, IconPlus } from '@tabler/icons-react';
import type { Organization } from '@gen-task/shared';
import { usersApi } from '../../services/api/users.api';
import { organizationsApi } from '../../services/api/organizations.api';
import type { OrganizationMember } from '@gen-task/shared';
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
  const { data: orgMembers } = useAsync(
    () => organizationsApi.members(organization.id),
    [organization.id],
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function openCreate(prefill?: { email?: string; name?: string; phone?: string }) {
    setMode('create');
    setEditingUserId(null);
    setEmail(prefill?.email ?? '');
    setName(prefill?.name ?? '');
    setPhone(prefill?.phone ?? '');
    setPassword('');
    setError(null);
    setOk(null);
    setModalOpen(true);
  }

  function openEdit(userId: string) {
    const user = (users ?? []).find((u) => u.id === userId);
    if (!user) return;
    setMode('edit');
    setEditingUserId(userId);
    setEmail(user.email);
    setName(user.name);
    setPhone(user.phone ?? '');
    setPassword('');
    setError(null);
    setOk(null);
    setModalOpen(true);
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

  async function saveAdmin() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      if (mode === 'create') {
        await organizationsApi.assignAdmin(organization.id, {
          email: email.trim(),
          name: name.trim(),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          ...(password.trim() ? { password: password.trim() } : {}),
        });
        setOk('Administrador asignado.');
      } else {
        if (!editingUserId) throw new Error('No se encontró el administrador a editar.');
        await usersApi.update(editingUserId, {
          name: name.trim(),
          phone: phone.trim(),
          ...(password.trim() ? { password: password.trim() } : {}),
        });
        setOk('Administrador actualizado.');
      }
      setModalOpen(false);
      setEmail('');
      setName('');
      setPhone('');
      setPassword('');
      setEditingUserId(null);
      reloadUsers();
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const userById = (id: string) => (users ?? []).find((u) => u.id === id);
  const admins = organization.admins;
  // Solo miembros de esta organización que aún no son admins (gestores candidatos a promover)
  const nonAdmins = (orgMembers ?? []).filter(
    (m: OrganizationMember) => !organization.admins.includes(m.userId),
  );

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Text fw={700}>Administradores ({admins.length})</Text>
          <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => openCreate()}>
            Nuevo admin
          </Button>
        </Group>
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
                  {u?.phone && <Text size="sm" c="dimmed">📱 {u.phone}</Text>}
                  <Badge size="xs" variant="light" color="blue">Admin</Badge>
                </Group>
                <Group gap={4} wrap="nowrap">
                  <Tooltip label="Editar administrador" withArrow>
                    <ActionIcon variant="subtle" color="blue" onClick={() => openEdit(id)}>
                      <IconPencil size={16} />
                    </ActionIcon>
                  </Tooltip>
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
              </Group>
            );
          })}
          {admins.length === 0 && (
            <Text c="dimmed" size="sm">No hay administradores asignados.</Text>
          )}
        </Stack>

        {/* Promover gestor existente de esta org a admin */}
        {nonAdmins.length > 0 && (
          <Stack gap={6}>
            <Text size="sm" c="dimmed">O promover un gestor de esta organización:</Text>
            {nonAdmins.slice(0, 8).map((m) => (
              <Group key={m.userId} justify="space-between" wrap="nowrap">
                <Text>
                  {m.name} <Text span size="sm" c="dimmed">({m.email})</Text>
                </Text>
                <Button
                  size="xs"
                  variant="light"
                  disabled={busy}
                  onClick={() => openCreate({ email: m.email, name: m.name })}
                >
                  + Admin
                </Button>
              </Group>
            ))}
          </Stack>
        )}
      </Stack>

      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title={mode === 'create' ? 'Crear administrador' : 'Editar administrador'}
        centered
      >
        <Stack gap="sm">
          <TextInput
            label="Correo"
            placeholder="correo@ejemplo.com"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            required
            disabled={mode === 'edit'}
          />
          <TextInput
            label="Nombre"
            placeholder="Nombre del administrador"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            required
          />
          <TextInput
            label="Teléfono (celular)"
            description="Se usa para enviar notificaciones por WhatsApp. Ej: 3001234567 o 573001234567"
            placeholder="3001234567"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.currentTarget.value)}
            required={mode === 'create'}
          />
          <PasswordInput
            label={mode === 'create' ? 'Contraseña' : 'Nueva contraseña (opcional)'}
            placeholder={mode === 'create' ? 'Mínimo 6 caracteres' : 'Dejar vacío para no cambiarla'}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            required={mode === 'create'}
          />

          {error && <Alert color="red">{error}</Alert>}

          <Group justify="flex-end">
            <Button variant="default" onClick={() => setModalOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button
              onClick={saveAdmin}
              loading={busy}
              disabled={
                !email.trim() ||
                !name.trim() ||
                (mode === 'create' && (!phone.trim() || !password.trim()))
              }
            >
              {mode === 'create' ? 'Crear' : 'Guardar cambios'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}
