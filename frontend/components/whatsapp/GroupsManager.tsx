'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  CopyButton,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { IconCopy, IconRefresh, IconSend, IconTrash } from '@tabler/icons-react';
import type {
  WhatsappGroup,
  WhatsappGroupJoinApprovalMode,
  WhatsappGroupStatus,
} from '@gen-task/shared';
import { whatsappApi } from '../../services/api/whatsapp.api';
import { useAsync } from '../../hooks/useAsync';
import { useToast } from '../toast/ToastProvider';

/** Mientras haya grupos PENDING se consulta para reflejar el webhook de Meta. */
const PENDING_POLL_MS = 3000;

const STATUS_BADGE: Record<WhatsappGroupStatus, { label: string; color: string }> = {
  PENDING: { label: 'Creando…', color: 'yellow' },
  ACTIVE: { label: 'Activo', color: 'green' },
  FAILED: { label: 'Fallido', color: 'red' },
  DELETED: { label: 'Eliminado', color: 'gray' },
};

/**
 * Grupos de WhatsApp (Groups API de Meta). La creacion es asincrona: el grupo
 * aparece como "Creando…" hasta que el webhook trae el enlace de invitacion.
 * Las personas entran voluntariamente por ese enlace (no se pueden agregar).
 */
export function GroupsManager({ organizationId }: { organizationId: string }) {
  const toast = useToast();
  const { data: groups, loading, error, reload } = useAsync(
    () => whatsappApi.listGroups(organizationId),
    [organizationId],
  );
  const hasPending = groups?.some((g) => g.status === 'PENDING') ?? false;

  useEffect(() => {
    if (!hasPending) return;
    const id = setInterval(() => reload(), PENDING_POLL_MS);
    return () => clearInterval(id);
  }, [hasPending, reload]);

  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [joinApprovalMode, setJoinApprovalMode] =
    useState<WhatsappGroupJoinApprovalMode>('auto_approve');
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!subject.trim()) return;
    setCreating(true);
    try {
      await whatsappApi.createGroup(organizationId, {
        subject: subject.trim(),
        description: description.trim() || undefined,
        joinApprovalMode,
      });
      setSubject('');
      setDescription('');
      toast.success('Grupo solicitado. Meta confirmará la creación en unos segundos.');
      reload();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Stack gap="md">
      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Text fw={700}>Crear grupo de WhatsApp</Text>
          <TextInput
            label="Nombre del grupo"
            required
            maxLength={128}
            value={subject}
            onChange={(e) => setSubject(e.currentTarget.value)}
            placeholder="Ej: Equipo de campo — Proyecto X"
          />
          <Textarea
            label="Descripción"
            maxLength={2048}
            autosize
            minRows={2}
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
          />
          <div>
            <Text size="sm" fw={500} mb={4}>
              Ingreso por enlace
            </Text>
            <SegmentedControl
              value={joinApprovalMode}
              onChange={(v) => setJoinApprovalMode(v as WhatsappGroupJoinApprovalMode)}
              data={[
                { value: 'auto_approve', label: 'Entrada directa' },
                { value: 'approval_required', label: 'Requiere aprobación' },
              ]}
            />
          </div>
          <Group justify="flex-end">
            <Button onClick={handleCreate} loading={creating} disabled={!subject.trim()}>
              Crear grupo
            </Button>
          </Group>
        </Stack>
      </Paper>

      {error && <Alert color="red">{error}</Alert>}
      {loading && !groups && <Text c="dimmed">Cargando grupos…</Text>}
      {groups?.length === 0 && <Text c="dimmed">Aún no hay grupos creados.</Text>}

      {groups?.map((group) => (
        <GroupCard
          key={group.id}
          organizationId={organizationId}
          group={group}
          onChange={reload}
        />
      ))}
    </Stack>
  );
}

function GroupCard({
  organizationId,
  group,
  onChange,
}: {
  organizationId: string;
  group: WhatsappGroup;
  onChange: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<'reset' | 'delete' | 'send' | null>(null);
  const [message, setMessage] = useState('');
  const badge = STATUS_BADGE[group.status];

  async function run(kind: 'reset' | 'delete' | 'send', fn: () => Promise<unknown>, ok: string) {
    setBusy(kind);
    try {
      await fn();
      toast.success(ok);
      onChange();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs">
            <Text fw={700}>{group.subject}</Text>
            <Badge color={badge.color} variant="light">
              {badge.label}
            </Badge>
            {group.status === 'ACTIVE' && (
              <Badge color="gray" variant="outline">
                {group.participants.length} participante(s)
              </Badge>
            )}
          </Group>
          <Button
            size="xs"
            variant="subtle"
            color="red"
            leftSection={<IconTrash size={14} />}
            loading={busy === 'delete'}
            onClick={() => {
              if (!confirm(`¿Eliminar el grupo "${group.subject}"? Se sacará a todos los participantes.`)) return;
              void run(
                'delete',
                () => whatsappApi.deleteGroup(organizationId, group.id),
                'Grupo eliminado.',
              );
            }}
          >
            Eliminar
          </Button>
        </Group>

        {group.description && (
          <Text size="sm" c="dimmed">
            {group.description}
          </Text>
        )}

        {group.status === 'FAILED' && group.error && (
          <Alert color="red" p="xs">
            {group.error}
          </Alert>
        )}

        {group.status === 'ACTIVE' && group.inviteLink && (
          <Group gap="xs">
            <Anchor href={group.inviteLink} target="_blank" size="sm">
              {group.inviteLink}
            </Anchor>
            <CopyButton value={group.inviteLink}>
              {({ copied, copy }) => (
                <Button
                  size="compact-xs"
                  variant="light"
                  leftSection={<IconCopy size={12} />}
                  onClick={copy}
                >
                  {copied ? 'Copiado' : 'Copiar'}
                </Button>
              )}
            </CopyButton>
            <Button
              size="compact-xs"
              variant="light"
              color="orange"
              leftSection={<IconRefresh size={12} />}
              loading={busy === 'reset'}
              onClick={() => {
                if (!confirm('El enlace actual dejará de funcionar. ¿Generar uno nuevo?')) return;
                void run(
                  'reset',
                  () => whatsappApi.resetGroupInviteLink(organizationId, group.id),
                  'Nuevo enlace generado.',
                );
              }}
            >
              Nuevo enlace
            </Button>
          </Group>
        )}

        {group.status === 'ACTIVE' && (
          <Group gap="xs" align="flex-end" wrap="nowrap">
            <Textarea
              style={{ flex: 1 }}
              autosize
              minRows={1}
              placeholder="Enviar mensaje al grupo…"
              value={message}
              onChange={(e) => setMessage(e.currentTarget.value)}
            />
            <Button
              leftSection={<IconSend size={14} />}
              loading={busy === 'send'}
              disabled={!message.trim()}
              onClick={() =>
                void run(
                  'send',
                  async () => {
                    await whatsappApi.sendGroupMessage(organizationId, group.id, message.trim());
                    setMessage('');
                  },
                  'Mensaje enviado al grupo.',
                )
              }
            >
              Enviar
            </Button>
          </Group>
        )}
      </Stack>
    </Paper>
  );
}
