'use client';

import { useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { NotificationChannel, type MessageTemplate } from '@gen-task/shared';
import { templatesApi } from '../../services/api/templates.api';
import { useAsync } from '../../hooks/useAsync';

/** Etiquetas legibles de cada medio de entrega de notificacion. */
const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  [NotificationChannel.WHATSAPP]: 'WhatsApp',
  [NotificationChannel.EMAIL]: 'Correo electrónico',
  [NotificationChannel.BOTH]: 'WhatsApp y correo',
};

const CHANNEL_OPTIONS = Object.values(NotificationChannel).map((c) => ({
  value: c,
  label: CHANNEL_LABELS[c],
}));

/**
 * Variables disponibles para las plantillas de notificacion (las que el backend
 * resuelve al notificar). Se insertan como `{{clave}}`. Es el mismo conjunto para
 * correo y WhatsApp, de modo que ambas plantillas se arman igual.
 */
const TEMPLATE_VARS: { key: string; label: string }[] = [
  { key: 'responsibleName', label: 'Responsable' },
  { key: 'activityName', label: 'Actividad' },
  { key: 'statusName', label: 'Estado' },
  { key: 'projectName', label: 'Proyecto' },
  { key: 'organizationName', label: 'Organización' },
  { key: 'link', label: 'Enlace a la actividad' },
];

/** True si el canal entrega por correo (y por tanto usa asunto). */
function usesEmail(channel: NotificationChannel): boolean {
  return channel === NotificationChannel.EMAIL || channel === NotificationChannel.BOTH;
}

type EditableField = HTMLTextAreaElement | HTMLInputElement;

/**
 * Chips de variables: al hacer clic insertan `{{clave}}` en la posicion del
 * cursor del ultimo campo (asunto o cuerpo) enfocado. Mismo patron que Motorola.
 */
function VariableChips({ onInsert }: { onInsert: (text: string) => void }) {
  return (
    <Group gap={4}>
      <Text size="xs" fw={700} c="blue.7" w="100%">
        Variables — haz clic para insertarla donde está el cursor:
      </Text>
      {TEMPLATE_VARS.map(({ key, label }) => (
        <Tooltip key={key} label={`{{${key}}}`} withArrow>
          <Button
            size="compact-xs"
            variant="light"
            color="blue"
            onMouseDown={(e) => e.preventDefault()} // no robar el foco del campo
            onClick={() => onInsert(`{{${key}}}`)}
          >
            {label}
          </Button>
        </Tooltip>
      ))}
    </Group>
  );
}

/**
 * Editor compartido de los campos de una plantilla (canal, asunto, cuerpo) con
 * chips de variables que insertan en el cursor. Lo usan tanto el formulario de
 * creacion como cada plantilla existente, para que se armen exactamente igual.
 */
function TemplateFields({
  channel,
  subject,
  body,
  onChannel,
  onSubject,
  onBody,
}: {
  channel: NotificationChannel;
  subject: string;
  body: string;
  onChannel: (c: NotificationChannel) => void;
  onSubject: (s: string) => void;
  onBody: (b: string) => void;
}) {
  // Ultimo campo enfocado, para insertar la variable en el cursor.
  const active = useRef<{ el: EditableField; field: 'subject' | 'body' } | null>(null);

  function insertVar(text: string) {
    const cur = active.current;
    if (!cur) {
      // Sin campo activo: agrega al cuerpo por defecto.
      onBody(body + text);
      return;
    }
    const el = cur.el;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    if (cur.field === 'subject') onSubject(next);
    else onBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  }

  return (
    <Stack gap="sm">
      <Select
        label="Medio de envío"
        data={CHANNEL_OPTIONS}
        value={channel}
        onChange={(v) => v && onChannel(v as NotificationChannel)}
        allowDeselect={false}
        maw={260}
      />

      <Paper p="sm" radius="sm" withBorder bg="blue.0">
        <VariableChips onInsert={insertVar} />
      </Paper>

      {usesEmail(channel) && (
        <TextInput
          label="Asunto del correo"
          description="Solo aplica al canal de correo. Admite variables."
          value={subject}
          onFocus={(e) => (active.current = { el: e.currentTarget, field: 'subject' })}
          onChange={(e) => onSubject(e.currentTarget.value)}
        />
      )}

      <Textarea
        label="Cuerpo del mensaje"
        autosize
        minRows={3}
        value={body}
        onFocus={(e) => (active.current = { el: e.currentTarget, field: 'body' })}
        onChange={(e) => onBody(e.currentTarget.value)}
      />
    </Stack>
  );
}

/**
 * Gestion de plantillas de notificacion (correo + WhatsApp). Las plantillas de
 * ambos canales se arman igual (mismo editor y variables); el canal define si se
 * envia por WhatsApp, correo o ambos. La `key` es el identificador logico (ej:
 * RESPONSIBLE_ASSIGNED, que personaliza el aviso al asignar un responsable).
 */
export function TemplatesManager({ organizationId }: { organizationId: string }) {
  const { data: templates, loading, reload } = useAsync(
    () => templatesApi.list(organizationId),
    [organizationId],
  );

  return (
    <Stack gap="lg" maw={760}>
      <Paper p="md" radius="md" withBorder>
        <Stack gap={4}>
          <Text fw={700}>Notificaciones automáticas</Text>
          <Text size="sm" c="dimmed">
            Para personalizar el mensaje que reciben los responsables al ser
            asignados a una actividad, crea una plantilla con la clave{' '}
            <Badge variant="light" size="sm">RESPONSIBLE_ASSIGNED</Badge>. Si no
            existe, se usa un texto por defecto. Elige el medio de envío
            (WhatsApp, correo o ambos); para correo puedes definir un asunto.
          </Text>
        </Stack>
      </Paper>

      <Stack gap="sm">
        <Text fw={700}>Plantillas existentes</Text>
        {loading && <Text>Cargando...</Text>}
        {templates?.map((t) => (
          <TemplateCard key={t.id} template={t} onChanged={reload} />
        ))}
        {templates && templates.length === 0 && (
          <Text c="dimmed">No hay plantillas configuradas.</Text>
        )}
      </Stack>

      <NewTemplateForm organizationId={organizationId} onCreated={reload} />
    </Stack>
  );
}

/** Plantilla existente: edicion del canal/asunto/cuerpo con chips de variables. */
function TemplateCard({
  template,
  onChanged,
}: {
  template: MessageTemplate;
  onChanged: () => void;
}) {
  const [channel, setChannel] = useState<NotificationChannel>(
    template.channel ?? NotificationChannel.WHATSAPP,
  );
  const [subject, setSubject] = useState(template.subject ?? '');
  const [body, setBody] = useState(template.body);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const dirty =
    body !== template.body ||
    subject !== (template.subject ?? '') ||
    channel !== (template.channel ?? NotificationChannel.WHATSAPP);

  async function save() {
    setSaving(true);
    try {
      await templatesApi.update(template.id, { body, subject, channel });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm('¿Eliminar esta plantilla?')) return;
    setRemoving(true);
    try {
      await templatesApi.remove(template.id);
      onChanged();
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text>
            <strong>{template.name}</strong>{' '}
            <Badge variant="light" size="sm" color="gray">{template.key}</Badge>
          </Text>
          <Button
            size="compact-sm"
            color="red"
            variant="light"
            leftSection={<IconTrash size={14} />}
            loading={removing}
            onClick={remove}
          >
            Eliminar
          </Button>
        </Group>
        <TemplateFields
          channel={channel}
          subject={subject}
          body={body}
          onChannel={setChannel}
          onSubject={setSubject}
          onBody={setBody}
        />
        {dirty && (
          <Button onClick={save} loading={saving} style={{ alignSelf: 'flex-start' }}>
            Guardar
          </Button>
        )}
      </Stack>
    </Paper>
  );
}

/** Formulario de nueva plantilla, armado con el mismo editor que las existentes. */
function NewTemplateForm({
  organizationId,
  onCreated,
}: {
  organizationId: string;
  onCreated: () => void;
}) {
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<NotificationChannel>(NotificationChannel.WHATSAPP);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await templatesApi.create(organizationId, {
        key: key.trim(),
        name: name.trim(),
        body: body.trim(),
        subject: usesEmail(channel) ? subject.trim() : undefined,
        channel,
      });
      setKey('');
      setName('');
      setSubject('');
      setBody('');
      setChannel(NotificationChannel.WHATSAPP);
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = Boolean(key.trim() && name.trim() && body.trim());

  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="sm">
        <Text fw={700}>Nueva plantilla</Text>
        {error && <Alert color="red">{error}</Alert>}
        <Group grow>
          <TextInput
            label="Clave"
            placeholder="Ej: RESPONSIBLE_ASSIGNED"
            value={key}
            onChange={(e) => setKey(e.currentTarget.value)}
          />
          <TextInput
            label="Nombre"
            placeholder="Nombre descriptivo"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
        </Group>
        <TemplateFields
          channel={channel}
          subject={subject}
          body={body}
          onChannel={setChannel}
          onSubject={setSubject}
          onBody={setBody}
        />
        <Button
          onClick={create}
          loading={busy}
          disabled={!canSubmit}
          style={{ alignSelf: 'flex-start' }}
        >
          Crear plantilla
        </Button>
      </Stack>
    </Paper>
  );
}
