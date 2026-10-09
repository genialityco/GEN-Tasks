'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Code,
  Group,
  Image,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { IconLink, IconLinkOff, IconRefresh, IconSend, IconX } from '@tabler/icons-react';
import type { WhatsappWebConnectionStatus, WhatsappWebGroup } from '@gen-task/shared';
import { whatsappWebApi } from '../../services/api/whatsapp.api';
import { useAsync } from '../../hooks/useAsync';
import { useToast } from '../toast/ToastProvider';

/** Mientras se conecta o espera la vinculacion se consulta el estado. */
const CONNECTING_POLL_MS = 2500;

const STATUS_BADGE: Record<WhatsappWebConnectionStatus, { label: string; color: string }> = {
  DISCONNECTED: { label: 'Desconectado', color: 'gray' },
  CONNECTING: { label: 'Conectando…', color: 'yellow' },
  QR: { label: 'Esperando vinculación', color: 'blue' },
  CONNECTED: { label: 'Conectado', color: 'green' },
};

/** Metodo de vinculacion: escanear QR o ingresar un codigo de 8 caracteres. */
type LinkMethod = 'qr' | 'code';

/** Muestra el codigo de vinculacion como en WhatsApp: ABCD-EFGH. */
function formatPairingCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/**
 * WhatsApp Web (librería no oficial): vincula un número de la organización
 * (por QR o por código) y permite escribir a los grupos de esa cuenta. Las
 * automatizaciones pueden elegir este proveedor en lugar de la API oficial.
 */
export function WhatsappWebManager({ organizationId }: { organizationId: string }) {
  const toast = useToast();
  const { data: session, error, reload } = useAsync(
    () => whatsappWebApi.getSession(organizationId),
    [organizationId],
  );
  const status = session?.status ?? 'DISCONNECTED';
  const waiting = status === 'CONNECTING' || status === 'QR';

  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => reload(), CONNECTING_POLL_MS);
    return () => clearInterval(id);
  }, [waiting, reload]);

  const [method, setMethod] = useState<LinkMethod>('qr');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState<'connect' | 'disconnect' | null>(null);

  async function run(kind: 'connect' | 'disconnect', fn: () => Promise<unknown>) {
    setBusy(kind);
    try {
      await fn();
      reload();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function connect() {
    void run('connect', () =>
      whatsappWebApi.connect(organizationId, method === 'code' ? phone.trim() : undefined),
    );
  }

  const badge = STATUS_BADGE[status];

  return (
    <Stack gap="md">
      <Alert color="yellow" variant="light" title="Librería no oficial">
        Usa el protocolo de WhatsApp Web con un número vinculado (como en un computador). No
        es un canal aprobado por Meta: WhatsApp puede bloquear números que envíen mensajes
        masivos o no solicitados. Usa un número dedicado de la organización.
      </Alert>

      {error && <Alert color="red">{error}</Alert>}

      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="xs">
              <Text fw={700}>Número vinculado</Text>
              <Badge color={badge.color} variant="light">
                {badge.label}
              </Badge>
            </Group>
            {status === 'CONNECTED' && (
              <Button
                variant="subtle"
                color="red"
                leftSection={<IconLinkOff size={14} />}
                loading={busy === 'disconnect'}
                onClick={() => {
                  if (!confirm('¿Desvincular el número? Las automatizaciones que usan WhatsApp Web dejarán de enviar.')) return;
                  void run('disconnect', () => whatsappWebApi.disconnect(organizationId));
                }}
              >
                Desvincular
              </Button>
            )}
            {waiting && (
              <Button
                variant="subtle"
                color="gray"
                leftSection={<IconX size={14} />}
                loading={busy === 'disconnect'}
                onClick={() => void run('disconnect', () => whatsappWebApi.disconnect(organizationId))}
              >
                Cancelar
              </Button>
            )}
          </Group>

          {status === 'CONNECTED' && (
            <Text size="sm">
              {session?.name ? `${session.name} · ` : ''}
              {session?.phone ? `+${session.phone}` : 'Número sin identificar'}
            </Text>
          )}

          {session?.lastError && status === 'DISCONNECTED' && (
            <Alert color="orange" p="xs">
              {session.lastError}
            </Alert>
          )}

          {status === 'DISCONNECTED' && (
            <Stack gap="sm" align="flex-start">
              <SegmentedControl
                value={method}
                onChange={(v) => setMethod(v as LinkMethod)}
                data={[
                  { value: 'qr', label: 'Escanear código QR' },
                  { value: 'code', label: 'Vincular con código' },
                ]}
              />
              {method === 'code' && (
                <TextInput
                  label="Número de WhatsApp a vincular"
                  description="Con código de país, ej: 573001234567"
                  placeholder="573001234567"
                  value={phone}
                  onChange={(e) => setPhone(e.currentTarget.value)}
                  w={280}
                />
              )}
              <Button
                leftSection={<IconLink size={14} />}
                loading={busy === 'connect'}
                disabled={method === 'code' && !phone.trim()}
                onClick={connect}
              >
                {method === 'qr' ? 'Generar código QR' : 'Generar código'}
              </Button>
            </Stack>
          )}

          {status === 'CONNECTING' && (
            <Text size="sm" c="dimmed">
              Conectando con WhatsApp…
            </Text>
          )}

          {status === 'QR' && session?.pairingCode && (
            <Stack gap="xs" align="flex-start">
              <Text size="sm">
                En el teléfono abre WhatsApp → <strong>Dispositivos vinculados</strong> →{' '}
                <strong>Vincular un dispositivo</strong> →{' '}
                <strong>Vincular con el número de teléfono</strong> e ingresa este código:
              </Text>
              <Code fz={28} fw={700} px="md" py="xs" style={{ letterSpacing: 4 }}>
                {formatPairingCode(session.pairingCode)}
              </Code>
              <Text size="xs" c="dimmed">
                El código vence en pocos minutos; si expira, genera uno nuevo.
              </Text>
            </Stack>
          )}

          {status === 'QR' && !session?.pairingCode && session?.qrDataUrl && (
            <Stack gap="xs" align="flex-start">
              <Text size="sm">
                En el teléfono abre WhatsApp → <strong>Dispositivos vinculados</strong> →{' '}
                <strong>Vincular un dispositivo</strong> y escanea este código:
              </Text>
              <Image src={session.qrDataUrl} alt="Código QR de WhatsApp" w={260} h={260} />
              <Text size="xs" c="dimmed">
                El código se renueva automáticamente cada pocos segundos.
              </Text>
            </Stack>
          )}

          {status === 'QR' && !session?.pairingCode && !session?.qrDataUrl && (
            <Text size="sm" c="dimmed">
              Generando código…
            </Text>
          )}
        </Stack>
      </Paper>

      {status === 'CONNECTED' && <WebGroupsList organizationId={organizationId} />}
    </Stack>
  );
}

/** Grupos de la cuenta vinculada, con envío directo de un mensaje. */
function WebGroupsList({ organizationId }: { organizationId: string }) {
  const { data: groups, loading, error, reload } = useAsync(
    () => whatsappWebApi.listGroups(organizationId),
    [organizationId],
  );

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text fw={700}>Grupos de la cuenta</Text>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconRefresh size={14} />}
          loading={loading}
          onClick={reload}
        >
          Actualizar
        </Button>
      </Group>
      <Text size="xs" c="dimmed">
        Para escribir a un grupo, el número vinculado debe ser miembro. Estos grupos se pueden
        elegir como destino en las automatizaciones (proveedor “WhatsApp Web”).
      </Text>
      {error && <Alert color="red">{error}</Alert>}
      {groups?.length === 0 && <Text c="dimmed">La cuenta no pertenece a ningún grupo.</Text>}
      {groups?.map((group) => (
        <WebGroupCard key={group.id} organizationId={organizationId} group={group} />
      ))}
    </Stack>
  );
}

function WebGroupCard({
  organizationId,
  group,
}: {
  organizationId: string;
  group: WhatsappWebGroup;
}) {
  const toast = useToast();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    try {
      await whatsappWebApi.sendGroupMessage(organizationId, group.id, message.trim());
      setMessage('');
      toast.success('Mensaje enviado al grupo.');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="xs">
        <Group gap="xs">
          <Text fw={700}>{group.subject}</Text>
          <Badge color="gray" variant="outline">
            {group.size} participante(s)
          </Badge>
        </Group>
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
            loading={sending}
            disabled={!message.trim()}
            onClick={() => void send()}
          >
            Enviar
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
