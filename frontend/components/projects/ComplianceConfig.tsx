'use client';

import { useState } from 'react';
import {
  Paper,
  Stack,
  Group,
  Text,
  Switch,
  NumberInput,
  Button,
  Divider,
  Select,
  TextInput,
  Textarea,
  Badge,
} from '@mantine/core';
import {
  DEFAULT_PROJECT_COMPLIANCE,
  WhatsappRecipientType,
  type Project,
  type ProjectCompliance,
  type ProjectStatus,
  type StatusComplianceAlert,
} from '@gen-task/shared';
import { projectsApi } from '../../services/api/projects.api';
import { organizationsApi } from '../../services/api/organizations.api';
import { useAsync } from '../../hooks/useAsync';
import { useToast } from '../toast/ToastProvider';

/** Etiquetas de los tipos de destinatario (mismas que en las reglas). */
const RECIPIENT_LABELS: Record<WhatsappRecipientType, string> = {
  HOST: 'Host de la actividad',
  MEMBER: 'Un miembro de la organización',
  RESPONSIBLES: 'Responsables de la actividad',
  PHONE: 'Teléfono manual',
};

/** Mensaje sugerido para una alerta de cumplimiento por estado. */
const DEFAULT_ALERT_MESSAGE =
  'La actividad *{{activityName}}* del proyecto *{{projectName}}* debía llegar al ' +
  'estado *{{statusName}}* dentro de {{daysFromCreation}} días y aún no lo ha hecho.\n' +
  'Revísala aquí: {{link}}';

/**
 * Configuracion del semaforo de cumplimiento (deadline) del proyecto y de las
 * alertas de WhatsApp por estado (SLA). La fecha limite del semaforo de color es
 * la programacion de la actividad o `creacion + dias por defecto`. Las alertas
 * por estado son independientes: cada estado puede exigir alcanzarse en X dias
 * desde la creacion y, si no se cumple, dispara un WhatsApp automatico.
 */
export function ComplianceConfig({
  project,
  onChanged,
}: {
  project: Project;
  onChanged: () => void;
}) {
  const initial = project.compliance ?? DEFAULT_PROJECT_COMPLIANCE;
  const [value, setValue] = useState<ProjectCompliance>(initial);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  // Miembros de la organizacion, para el destinatario "Un miembro".
  const { data: members } = useAsync(
    () => organizationsApi.members(project.organizationId),
    [project.organizationId],
  );

  const activeStatuses = project.statuses
    .filter((s) => !s.isArchived)
    .sort((a, b) => a.order - b.order);

  function patch(p: Partial<ProjectCompliance>) {
    setValue((prev) => ({ ...prev, ...p }));
  }

  /** Alerta configurada para un estado (o `undefined` si no tiene). */
  function alertFor(statusId: string): StatusComplianceAlert | undefined {
    return value.statusAlerts?.find((a) => a.statusId === statusId);
  }

  /** Crea o actualiza la alerta de un estado con los cambios dados. */
  function upsertAlert(statusId: string, p: Partial<StatusComplianceAlert>) {
    setValue((prev) => {
      const list = prev.statusAlerts ?? [];
      const existing = list.find((a) => a.statusId === statusId);
      const base: StatusComplianceAlert = existing ?? {
        statusId,
        daysFromCreation: 1,
        enabled: false,
        recipientType: WhatsappRecipientType.RESPONSIBLES,
        message: DEFAULT_ALERT_MESSAGE,
      };
      const next = { ...base, ...p };
      const statusAlerts = existing
        ? list.map((a) => (a.statusId === statusId ? next : a))
        : [...list, next];
      return { ...prev, statusAlerts };
    });
  }

  async function save() {
    setBusy(true);
    try {
      await projectsApi.update(project.id, { compliance: value });
      toast.success('Semáforo y alertas por estado guardados.');
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
        <Group justify="space-between">
          <Text fw={700}>Semáforo de cumplimiento</Text>
          <Switch
            checked={value.enabled}
            onChange={(e) => patch({ enabled: e.currentTarget.checked })}
            label={value.enabled ? 'Activado' : 'Desactivado'}
          />
        </Group>
        <Text size="sm" c="dimmed">
          La fecha límite de una actividad es su programación (fecha exacta). Si no
          tiene, se calcula como creación + días por defecto.
        </Text>

        <Group gap="md" wrap="wrap" align="flex-end">
          <NumberInput
            label="Días por defecto"
            description="Desde la creación"
            value={value.defaultDurationDays ?? ''}
            onChange={(v) =>
              patch({ defaultDurationDays: v === '' ? undefined : Number(v) })
            }
            min={0}
            disabled={!value.enabled}
            w={150}
          />
          <NumberInput
            label="Prioritario (amarillo)"
            description="≤ días restantes"
            value={value.attentionThresholdDays}
            onChange={(v) => patch({ attentionThresholdDays: Number(v) || 0 })}
            min={0}
            disabled={!value.enabled}
            w={170}
          />
          <NumberInput
            label="Por expirar (rojo)"
            description="≤ días restantes"
            value={value.criticalThresholdDays}
            onChange={(v) => patch({ criticalThresholdDays: Number(v) || 0 })}
            min={0}
            disabled={!value.enabled}
            w={160}
          />
        </Group>

        <Divider my="xs" />

        <Stack gap={4}>
          <Text fw={700}>Alertas por estado (SLA)</Text>
          <Text size="sm" c="dimmed">
            Define en cuántos días desde la creación una actividad debería haber
            alcanzado cada estado. Si al cumplirse el plazo la actividad aún no lo
            alcanzó, se envía un WhatsApp automático (una sola vez por actividad y
            estado). Requiere el semáforo activado.
          </Text>
        </Stack>

        <Stack gap="sm">
          {activeStatuses.map((status) => (
            <StatusAlertRow
              key={status.id}
              status={status}
              alert={alertFor(status.id)}
              disabled={!value.enabled}
              members={(members ?? []).map((m) => ({
                value: m.userId,
                label: m.name,
              }))}
              onChange={(p) => upsertAlert(status.id, p)}
            />
          ))}
        </Stack>

        <Button onClick={save} loading={busy} style={{ alignSelf: 'flex-start' }}>
          Guardar semáforo
        </Button>
      </Stack>
    </Paper>
  );
}

/** Fila de configuracion de la alerta de cumplimiento de un estado. */
function StatusAlertRow({
  status,
  alert,
  disabled,
  members,
  onChange,
}: {
  status: ProjectStatus;
  alert: StatusComplianceAlert | undefined;
  disabled: boolean;
  members: { value: string; label: string }[];
  onChange: (patch: Partial<StatusComplianceAlert>) => void;
}) {
  const enabled = alert?.enabled ?? false;
  const recipientType = alert?.recipientType ?? WhatsappRecipientType.RESPONSIBLES;

  return (
    <Paper withBorder radius="sm" p="sm" >
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: status.color ?? '#000000',
                display: 'inline-block',
              }}
            />
            <Text fw={600}>{status.name}</Text>
            {enabled && (
              <Badge size="xs" variant="light" color="blue">
                Alerta activa
              </Badge>
            )}
          </Group>
          <Switch
            checked={enabled}
            disabled={disabled}
            onChange={(e) => onChange({ enabled: e.currentTarget.checked })}
            label={enabled ? 'Activa' : 'Inactiva'}
          />
        </Group>

        {enabled && (
          <Group gap="md" align="flex-start" wrap="wrap">
            <NumberInput
              label="Días desde creación"
              description="Plazo para alcanzar el estado"
              value={alert?.daysFromCreation ?? 1}
              onChange={(v) => onChange({ daysFromCreation: Number(v) || 0 })}
              min={0}
              disabled={disabled}
              w={180}
            />
            <Select
              label="Destinatario"
              data={(Object.keys(RECIPIENT_LABELS) as WhatsappRecipientType[]).map(
                (t) => ({ value: t, label: RECIPIENT_LABELS[t] }),
              )}
              value={recipientType}
              onChange={(v) =>
                v && onChange({ recipientType: v as WhatsappRecipientType })
              }
              disabled={disabled}
              allowDeselect={false}
              w={240}
            />
            {recipientType === WhatsappRecipientType.MEMBER && (
              <Select
                label="Miembro"
                placeholder="Selecciona un usuario"
                data={members}
                value={alert?.recipientUserId ?? null}
                onChange={(v) => onChange({ recipientUserId: v ?? undefined })}
                disabled={disabled}
                searchable
                w={240}
              />
            )}
            {recipientType === WhatsappRecipientType.PHONE && (
              <TextInput
                label="Teléfono"
                placeholder="Ej: 3001234567"
                value={alert?.recipientPhone ?? ''}
                onChange={(e) => onChange({ recipientPhone: e.currentTarget.value })}
                disabled={disabled}
                w={200}
              />
            )}
            <Textarea
              label="Mensaje"
              description="Variables: {{activityName}}, {{statusName}}, {{projectName}}, {{daysFromCreation}}, {{link}}"
              value={alert?.message ?? DEFAULT_ALERT_MESSAGE}
              onChange={(e) => onChange({ message: e.currentTarget.value })}
              disabled={disabled}
              autosize
              minRows={2}
              style={{ flex: 1, minWidth: 260 }}
            />
          </Group>
        )}
      </Stack>
    </Paper>
  );
}
