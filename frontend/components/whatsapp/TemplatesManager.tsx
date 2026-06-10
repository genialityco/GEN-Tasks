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
import {
  NotificationChannel,
  type ActivityCustomField,
  type MessageTemplate,
  type Project,
} from '@gen-task/shared';
import { templatesApi } from '../../services/api/templates.api';
import { projectsApi } from '../../services/api/projects.api';
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

/** Una variable insertable (clave interpolable + etiqueta legible). */
interface TemplateVar {
  key: string;
  label: string;
}

/** Boton-chip que inserta `{{clave}}` sin robar el foco del campo activo. */
function VarChip({
  variable,
  color,
  onInsert,
}: {
  variable: TemplateVar;
  color: string;
  onInsert: (text: string) => void;
}) {
  return (
    <Tooltip label={`{{${variable.key}}}`} withArrow>
      <Button
        size="compact-xs"
        variant="light"
        color={color}
        onMouseDown={(e) => e.preventDefault()} // no robar el foco del campo
        onClick={() => onInsert(`{{${variable.key}}}`)}
      >
        {variable.label}
      </Button>
    </Tooltip>
  );
}

/**
 * Chips de variables: al hacer clic insertan `{{clave}}` en la posicion del
 * cursor del ultimo campo (asunto o cuerpo) enfocado. Mismo patron que Motorola.
 * Muestra las variables del sistema y, si se selecciono un proyecto, tambien los
 * campos personalizados de ese proyecto.
 */
function VariableChips({
  customVars,
  onInsert,
}: {
  customVars: TemplateVar[];
  onInsert: (text: string) => void;
}) {
  return (
    <Stack gap={6}>
      <Group gap={4}>
        <Text size="xs" fw={700} c="blue.7" w="100%">
          Variables — haz clic para insertarla donde está el cursor:
        </Text>
        {TEMPLATE_VARS.map((v) => (
          <VarChip key={v.key} variable={v} color="blue" onInsert={onInsert} />
        ))}
      </Group>
      {customVars.length > 0 && (
        <Group gap={4}>
          <Text size="xs" fw={700} c="teal.7" w="100%">
            Campos personalizados del proyecto seleccionado:
          </Text>
          {customVars.map((v) => (
            <VarChip key={v.key} variable={v} color="teal" onInsert={onInsert} />
          ))}
        </Group>
      )}
    </Stack>
  );
}

/** Campos personalizados activos de un proyecto, como variables insertables. */
function projectCustomVars(project: Project | undefined): TemplateVar[] {
  if (!project) return [];
  return (project.customFields ?? [])
    .filter((f: ActivityCustomField) => f.isActive && !f.isArchived)
    .map((f: ActivityCustomField) => ({ key: f.key, label: f.label }));
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
  projects,
  onChannel,
  onSubject,
  onBody,
}: {
  channel: NotificationChannel;
  subject: string;
  body: string;
  /** Proyectos de la organizacion, para elegir de cual mostrar sus campos. */
  projects: Project[];
  onChannel: (c: NotificationChannel) => void;
  onSubject: (s: string) => void;
  onBody: (b: string) => void;
}) {
  // Ultimo campo enfocado, para insertar la variable en el cursor.
  const active = useRef<{ el: EditableField; field: 'subject' | 'body' } | null>(null);
  // Proyecto cuyas variables de campos personalizados se muestran como chips.
  // Es solo una ayuda para insertar `{{clave}}`; no se persiste en la plantilla
  // (la plantilla es de la organizacion y aplica a todos los proyectos).
  const [previewProjectId, setPreviewProjectId] = useState<string | null>(null);
  const previewProject = projects.find((p) => p.id === previewProjectId);
  const customVars = projectCustomVars(previewProject);

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

      {projects.length > 0 && (
        <Select
          label="Ver campos del proyecto"
          description="Solo para mostrar sus campos como variables. No se guarda en la plantilla."
          placeholder="Selecciona un proyecto..."
          data={projects.map((p) => ({ value: p.id, label: p.name }))}
          value={previewProjectId}
          onChange={setPreviewProjectId}
          clearable
          searchable
          maw={320}
        />
      )}

      <Paper p="sm" radius="sm" withBorder bg="blue.0">
        <VariableChips customVars={customVars} onInsert={insertVar} />
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
  // Proyectos de la organizacion: alimentan el selector "Ver campos del
  // proyecto" para insertar campos personalizados como variables.
  const { data: projects } = useAsync(
    () => projectsApi.listByOrg(organizationId),
    [organizationId],
  );
  const projectList = projects ?? [];

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
          <TemplateCard
            key={t.id}
            template={t}
            projects={projectList}
            onChanged={reload}
          />
        ))}
        {templates && templates.length === 0 && (
          <Text c="dimmed">No hay plantillas configuradas.</Text>
        )}
      </Stack>

      <NewTemplateForm
        organizationId={organizationId}
        projects={projectList}
        onCreated={reload}
      />
    </Stack>
  );
}

/** Plantilla existente: edicion del canal/asunto/cuerpo con chips de variables. */
function TemplateCard({
  template,
  projects,
  onChanged,
}: {
  template: MessageTemplate;
  projects: Project[];
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
          projects={projects}
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
  projects,
  onCreated,
}: {
  organizationId: string;
  projects: Project[];
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
          projects={projects}
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
