'use client';

import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  MultiSelect,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import {
  CustomFieldType,
  FieldAlertRecipientType,
  FieldAlertTrigger,
  NotificationChannel,
  SCHEDULED_DATE_FIELD_KEY,
  type FieldAlert,
  type FieldAlertRecipient,
  type Project,
} from '@gen-task/shared';
import { projectsApi } from '../../services/api/projects.api';
import { organizationsApi } from '../../services/api/organizations.api';
import { useAsync } from '../../hooks/useAsync';
import { useToast } from '../toast/ToastProvider';

const TRIGGER_LABELS: Record<FieldAlertTrigger, string> = {
  EVENT_DAY: 'El día del evento',
  AFTER_FIELD_FILLED: 'X días después de llenarse otro campo',
};

const RECIPIENT_LABELS: Record<FieldAlertRecipientType, string> = {
  EMAIL: 'Correo',
  PHONE: 'WhatsApp a teléfono',
  MEMBER: 'Miembro de la organización',
  RESPONSIBLES: 'Responsables de la actividad',
};

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Correo',
  BOTH: 'WhatsApp y correo',
};

const VARS_HELP =
  'Variables: {{activityName}}, {{projectName}}, {{statusName}}, {{eventDate}}, {{missingFields}}, {{link}} y las keys de los campos';

/** Alerta nueva con valores por defecto para el disparador dado. */
function newAlert(trigger: FieldAlertTrigger): FieldAlert {
  return trigger === FieldAlertTrigger.EVENT_DAY
    ? {
        id: '',
        name: 'Bases pendientes el día del evento',
        enabled: true,
        trigger,
        requiredFieldKeys: [],
        dateFieldKey: SCHEDULED_DATE_FIELD_KEY,
        sendAtHour: 16,
        recipients: [],
        memberChannel: NotificationChannel.WHATSAPP,
        message:
          'Hoy {{eventDate}} es el evento *{{activityName}}*. ' +
          'Aún falta subir: {{missingFields}}. Tienen plazo hasta las 5:00 p. m.\n' +
          'Actividad: {{link}}',
      }
    : {
        id: '',
        name: 'Material del evento pendiente',
        enabled: true,
        trigger,
        requiredFieldKeys: [],
        sourceFieldKey: '',
        delayDays: 2,
        recipients: [],
        memberChannel: NotificationChannel.WHATSAPP,
        message:
          'Está pendiente de subirse el material del evento *{{activityName}}* ' +
          '(carpeta de Drive).\nActividad: {{link}}',
      };
}

/**
 * Alertas por campo pendiente del proyecto: recordatorios automaticos cuando un
 * campo sigue vacio el dia del evento o X dias despues de llenarse otro campo.
 * Se evaluan cada hora en el backend y se envian una sola vez por actividad.
 */
export function FieldAlertsConfig({
  project,
  onChanged,
}: {
  project: Project;
  onChanged: () => void;
}) {
  const [alerts, setAlerts] = useState<FieldAlert[]>(project.fieldAlerts ?? []);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const { data: members } = useAsync(
    () => organizationsApi.members(project.organizationId),
    [project.organizationId],
  );
  const memberOptions = (members ?? []).map((m) => ({
    value: m.userId,
    label: m.name,
  }));

  const activeFields = project.customFields.filter(
    (f) => f.isActive && !f.isArchived,
  );
  const fieldOptions = activeFields.map((f) => ({ value: f.key, label: f.label }));
  const dateOptions = [
    { value: SCHEDULED_DATE_FIELD_KEY, label: 'Fecha programada' },
    ...activeFields
      .filter((f) => f.type === CustomFieldType.DATE)
      .map((f) => ({ value: f.key, label: f.label })),
  ];

  function update(index: number, patch: Partial<FieldAlert>) {
    setAlerts((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }

  async function save() {
    const invalid = alerts.find(
      (a) =>
        !a.name.trim() ||
        (a.requiredFieldKeys ?? []).length === 0 ||
        (a.trigger === FieldAlertTrigger.AFTER_FIELD_FILLED && !a.sourceFieldKey),
    );
    if (invalid) {
      toast.error(`Completa los campos de la alerta "${invalid.name || 'sin nombre'}".`);
      return;
    }
    setBusy(true);
    try {
      await projectsApi.update(project.id, { fieldAlerts: alerts });
      toast.success('Alertas por campo guardadas.');
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Text fw={700}>Alertas por campo pendiente</Text>
        <Text size="sm" c="dimmed">
          Envían un recordatorio cuando un campo sigue vacío el día del evento o
          unos días después de llenarse otro campo. Se revisan cada hora (hora
          Colombia) y se envían una sola vez por actividad.
        </Text>

        {alerts.map((alert, index) => (
          <FieldAlertCard
            key={alert.id || `new-${index}`}
            alert={alert}
            fieldOptions={fieldOptions}
            dateOptions={dateOptions}
            memberOptions={memberOptions}
            onChange={(p) => update(index, p)}
            onRemove={() => setAlerts((prev) => prev.filter((_, i) => i !== index))}
          />
        ))}

        <Group gap="xs">
          <Button
            variant="light"
            onClick={() => setAlerts((p) => [...p, newAlert(FieldAlertTrigger.EVENT_DAY)])}
          >
            + Alerta el día del evento
          </Button>
          <Button
            variant="light"
            onClick={() =>
              setAlerts((p) => [...p, newAlert(FieldAlertTrigger.AFTER_FIELD_FILLED)])
            }
          >
            + Alerta tras llenarse un campo
          </Button>
        </Group>

        <Button onClick={save} loading={busy} style={{ alignSelf: 'flex-start' }}>
          Guardar alertas
        </Button>
      </Stack>
    </Paper>
  );
}

function FieldAlertCard({
  alert,
  fieldOptions,
  dateOptions,
  memberOptions,
  onChange,
  onRemove,
}: {
  alert: FieldAlert;
  fieldOptions: { value: string; label: string }[];
  dateOptions: { value: string; label: string }[];
  memberOptions: { value: string; label: string }[];
  onChange: (patch: Partial<FieldAlert>) => void;
  onRemove: () => void;
}) {
  const recipients = alert.recipients ?? [];
  const usesMembers = recipients.some(
    (r) =>
      r.type === FieldAlertRecipientType.MEMBER ||
      r.type === FieldAlertRecipientType.RESPONSIBLES,
  );

  function updateRecipient(index: number, patch: Partial<FieldAlertRecipient>) {
    onChange({
      recipients: recipients.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    });
  }

  return (
    <Paper withBorder radius="sm" p="sm">
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap" style={{ flex: 1 }}>
            <TextInput
              value={alert.name}
              onChange={(e) => onChange({ name: e.currentTarget.value })}
              placeholder="Nombre de la alerta"
              style={{ flex: 1, maxWidth: 360 }}
            />
            <Badge size="xs" variant="light">
              {TRIGGER_LABELS[alert.trigger]}
            </Badge>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Switch
              checked={alert.enabled}
              onChange={(e) => onChange({ enabled: e.currentTarget.checked })}
              label={alert.enabled ? 'Activa' : 'Inactiva'}
            />
            <Button size="xs" variant="subtle" color="red" onClick={onRemove}>
              Eliminar
            </Button>
          </Group>
        </Group>

        <Group gap="md" align="flex-start" wrap="wrap">
          <MultiSelect
            label="Campos que deben estar llenos"
            description="Si alguno sigue vacío, se envía la alerta"
            data={fieldOptions}
            value={alert.requiredFieldKeys ?? []}
            onChange={(v) => onChange({ requiredFieldKeys: v })}
            searchable
            w={280}
          />
          {alert.trigger === FieldAlertTrigger.EVENT_DAY ? (
            <>
              <Select
                label="Fecha del evento"
                data={dateOptions}
                value={alert.dateFieldKey || SCHEDULED_DATE_FIELD_KEY}
                onChange={(v) => v && onChange({ dateFieldKey: v })}
                allowDeselect={false}
                w={200}
              />
              <NumberInput
                label="Hora de envío"
                description="0-23, hora Colombia"
                value={alert.sendAtHour ?? 8}
                onChange={(v) => onChange({ sendAtHour: Number(v) || 0 })}
                min={0}
                max={23}
                w={150}
              />
            </>
          ) : (
            <>
              <Select
                label="Desde que se llenó"
                data={fieldOptions}
                value={alert.sourceFieldKey || null}
                onChange={(v) => onChange({ sourceFieldKey: v ?? '' })}
                searchable
                w={240}
              />
              <NumberInput
                label="Días de plazo"
                value={alert.delayDays ?? 2}
                onChange={(v) => onChange({ delayDays: Number(v) || 0 })}
                min={0}
                w={130}
              />
            </>
          )}
        </Group>

        <Stack gap={6}>
          <Text size="sm" fw={600}>
            Destinatarios
          </Text>
          {recipients.map((r, i) => (
            <Group key={i} gap="xs" wrap="nowrap" align="flex-end">
              <Select
                data={(Object.keys(RECIPIENT_LABELS) as FieldAlertRecipientType[]).map(
                  (t) => ({ value: t, label: RECIPIENT_LABELS[t] }),
                )}
                value={r.type}
                onChange={(v) =>
                  v && updateRecipient(i, { type: v as FieldAlertRecipientType, value: '' })
                }
                allowDeselect={false}
                w={240}
              />
              {r.type === FieldAlertRecipientType.MEMBER && (
                <Select
                  placeholder="Selecciona un usuario"
                  data={memberOptions}
                  value={r.value || null}
                  onChange={(v) => updateRecipient(i, { value: v ?? '' })}
                  searchable
                  w={240}
                />
              )}
              {(r.type === FieldAlertRecipientType.EMAIL ||
                r.type === FieldAlertRecipientType.PHONE) && (
                <TextInput
                  placeholder={
                    r.type === FieldAlertRecipientType.EMAIL
                      ? 'correo@ejemplo.com'
                      : 'Ej: 3001234567'
                  }
                  value={r.value ?? ''}
                  onChange={(e) => updateRecipient(i, { value: e.currentTarget.value })}
                  w={240}
                />
              )}
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label="Quitar destinatario"
                onClick={() =>
                  onChange({ recipients: recipients.filter((_, j) => j !== i) })
                }
              >
                ✕
              </ActionIcon>
            </Group>
          ))}
          <Group gap="xs">
            <Button
              size="xs"
              variant="subtle"
              onClick={() =>
                onChange({
                  recipients: [
                    ...recipients,
                    { type: FieldAlertRecipientType.EMAIL, value: '' },
                  ],
                })
              }
            >
              + Destinatario
            </Button>
            {usesMembers && (
              <Select
                size="xs"
                label="Canal para miembros/responsables"
                data={(Object.keys(CHANNEL_LABELS) as NotificationChannel[]).map((c) => ({
                  value: c,
                  label: CHANNEL_LABELS[c],
                }))}
                value={alert.memberChannel ?? NotificationChannel.WHATSAPP}
                onChange={(v) => v && onChange({ memberChannel: v as NotificationChannel })}
                allowDeselect={false}
                w={200}
              />
            )}
          </Group>
        </Stack>

        <TextInput
          label="Asunto del correo"
          placeholder={`${alert.name}: {{activityName}}`}
          value={alert.subject ?? ''}
          onChange={(e) => onChange({ subject: e.currentTarget.value })}
        />
        <Textarea
          label="Mensaje"
          description={VARS_HELP}
          value={alert.message}
          onChange={(e) => onChange({ message: e.currentTarget.value })}
          autosize
          minRows={2}
        />
      </Stack>
    </Paper>
  );
}
