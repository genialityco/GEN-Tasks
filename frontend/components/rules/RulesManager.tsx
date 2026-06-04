'use client';

import { useState } from 'react';
import {
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
  Divider,
} from '@mantine/core';
import { IconTrash, IconPlus } from '@tabler/icons-react';
import {
  ConditionOperator,
  CustomFieldType,
  LogicalOperator,
  RuleActionType,
  RuleEvent,
  UserRole,
  type ActivityCustomField,
  type ProjectStatus,
} from '@gen-task/shared';
import { rulesApi } from '../../services/api/rules.api';
import { organizationsApi } from '../../services/api/organizations.api';
import { useAsync } from '../../hooks/useAsync';
import {
  ConditionBuilder,
  customFieldOptions,
  type ConditionDraft,
} from '../projects/ConditionBuilder';

const EVENT_LABELS: Record<RuleEvent, string> = {
  ON_ACTIVITY_CREATED: 'Al crear actividad',
  ON_FIELD_UPDATED: 'Al actualizar campo',
  ON_STATUS_CHANGED: 'Al cambiar estado',
};

const ACTION_LABELS: Record<RuleActionType, string> = {
  SEND_WHATSAPP: 'Enviar WhatsApp',
  CHANGE_STATUS: 'Cambiar estado',
  REQUEST_HOST_INFORMATION: 'Solicitar info al host',
  ASSIGN_RESPONSIBLE: 'Notificar a',
  REGISTER_HISTORY_EVENT: 'Registrar en historial',
  CREATE_CUSTOM_FIELD: 'Crear campo personalizado',
};

/** Etiquetas de los tipos de campo (igual que en el gestor de campos). */
const FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  TEXT: 'Texto',
  NUMBER: 'Numero',
  DATE: 'Fecha',
  FILE: 'Archivo',
  IMAGE: 'Imagen',
  VIDEO: 'Video',
  LIST: 'Lista',
  LINK: 'Enlace',
};

/** Acciones cuyo payload es un mensaje/comentario de texto libre. */
const MESSAGE_ACTIONS: RuleActionType[] = [
  RuleActionType.SEND_WHATSAPP,
  RuleActionType.REQUEST_HOST_INFORMATION,
  RuleActionType.REGISTER_HISTORY_EVENT,
];

/** Borrador de un campo a crear por la accion CREATE_CUSTOM_FIELD. */
interface FieldDraft {
  label: string;
  type: CustomFieldType;
  required: boolean;
  optionsText: string;
}

function emptyFieldDraft(): FieldDraft {
  return { label: '', type: CustomFieldType.TEXT, required: false, optionsText: '' };
}

/**
 * Seccion de automatizaciones (triggers) del proyecto. Crea reglas con un evento,
 * una condicion opcional sobre un campo y una accion. La evaluacion y ejecucion
 * la realiza el motor de reglas del backend al crear/cambiar estado. Se embebe
 * dentro de `ProjectRulesConfig` (no dibuja su propia tarjeta) y comparte el
 * editor de condiciones con las restricciones de estado.
 */
export function RulesManager({
  projectId,
  organizationId,
  fields,
  statuses,
}: {
  projectId: string;
  organizationId: string;
  fields: ActivityCustomField[];
  statuses: ProjectStatus[];
}) {
  const { data: rules, reload } = useAsync(() => rulesApi.list(projectId), [projectId]);
  // Miembros (Admin/Gestor) de la organizacion, para la accion "Asignar responsable".
  const { data: members } = useAsync(
    () => organizationsApi.members(organizationId),
    [organizationId],
  );

  /** Nombre legible de un estado por id (vacio si no se especifica). */
  const statusName = (id?: string) =>
    id ? statuses.find((s) => s.id === id)?.name ?? id : '';

  const [name, setName] = useState('');
  const [event, setEvent] = useState<RuleEvent>(RuleEvent.ON_STATUS_CHANGED);
  const [condition, setCondition] = useState<ConditionDraft>({
    fieldKey: '',
    operator: ConditionOperator.EQUALS,
    value: '',
  });
  const [actionType, setActionType] = useState<RuleActionType>(
    RuleActionType.REGISTER_HISTORY_EVENT,
  );
  const [actionMessage, setActionMessage] = useState('');
  const [actionStatusId, setActionStatusId] = useState('');
  const [actionResponsibleId, setActionResponsibleId] = useState('');
  // Transicion opcional para el evento "Al cambiar de estado".
  const [fromStatusId, setFromStatusId] = useState('');
  const [toStatusId, setToStatusId] = useState('');
  // Configuracion de los campos a crear (accion CREATE_CUSTOM_FIELD): permite
  // definir uno o varios campos por accion, con la misma logica que el gestor
  // de campos personalizados.
  const [cfDrafts, setCfDrafts] = useState<FieldDraft[]>([emptyFieldDraft()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeStatuses = statuses.filter((s) => !s.isArchived);
  const statusSelectData = activeStatuses.map((s) => ({ value: s.id, label: s.name }));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const conditions = condition.fieldKey
        ? [
            {
              fieldKey: condition.fieldKey,
              operator: condition.operator,
              value: condition.value || undefined,
            },
          ]
        : [];
      const payload: Record<string, unknown> = {};
      if (MESSAGE_ACTIONS.includes(actionType)) {
        payload.message = actionMessage;
      }
      if (actionType === RuleActionType.CHANGE_STATUS) {
        payload.statusId = actionStatusId;
      }
      if (actionType === RuleActionType.ASSIGN_RESPONSIBLE) {
        payload.responsibleId = actionResponsibleId;
        // Mensaje que se notificara al responsable cuando exista el servicio
        // de notificaciones.
        payload.message = actionMessage;
      }
      if (actionType === RuleActionType.CREATE_CUSTOM_FIELD) {
        payload.fields = cfDrafts
          .filter((d) => d.label.trim())
          .map((d) => ({
            label: d.label.trim(),
            type: d.type,
            required: d.required,
            ...(d.type === CustomFieldType.LIST
              ? {
                  options: d.optionsText
                    .split(',')
                    .map((o) => o.trim())
                    .filter(Boolean)
                    .map((o) => ({ label: o, value: o })),
                }
              : {}),
          }));
      }
      await rulesApi.create(projectId, {
        name: name.trim(),
        event,
        conditions,
        logicalOperator: LogicalOperator.AND,
        actions: [{ type: actionType, payload }],
        // La transicion solo aplica al evento de cambio de estado.
        ...(event === RuleEvent.ON_STATUS_CHANGED
          ? {
              fromStatusId: fromStatusId || undefined,
              toStatusId: toStatusId || undefined,
            }
          : {}),
      });
      setName('');
      setCondition({ fieldKey: '', operator: ConditionOperator.EQUALS, value: '' });
      setActionMessage('');
      setActionResponsibleId('');
      setActionStatusId('');
      setFromStatusId('');
      setToStatusId('');
      setCfDrafts([emptyFieldDraft()]);
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(ruleId: string) {
    await rulesApi.remove(projectId, ruleId);
    reload();
  }

  // --- Borradores de campos (accion CREATE_CUSTOM_FIELD) ---
  function updateDraft(index: number, patch: Partial<FieldDraft>) {
    setCfDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }
  function addDraft() {
    setCfDrafts((prev) => [...prev, emptyFieldDraft()]);
  }
  function removeDraft(index: number) {
    setCfDrafts((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  return (
    <Stack gap="sm">
      {error && <Alert color="red">{error}</Alert>}

      <Stack gap={6}>
        {rules?.map((r) => (
          <Group
            key={r.id}
            justify="space-between"
            wrap="nowrap"
            gap="sm"
            p="xs"
            style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}
          >
            <Text size="sm">
              <strong>{r.name}</strong>{' '}
              <Text span size="sm" c="dimmed">
                {EVENT_LABELS[r.event]}
                {r.event === RuleEvent.ON_STATUS_CHANGED && (r.fromStatusId || r.toStatusId)
                  ? ` (${statusName(r.fromStatusId) || 'cualquiera'} → ${statusName(r.toStatusId) || 'cualquiera'})`
                  : ''}{' '}
                · {r.actions.map((a) => ACTION_LABELS[a.type]).join(', ')}
              </Text>
            </Text>
            <Tooltip label="Eliminar" withArrow>
              <ActionIcon color="red" variant="subtle" onClick={() => remove(r.id)}>
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        ))}
        {rules && rules.length === 0 && (
          <Text size="sm" c="dimmed">Sin automatizaciones configuradas.</Text>
        )}
      </Stack>

      <Divider my="xs" variant="dashed" />

      <Text size="sm" fw={600}>Nueva automatización</Text>
      <form onSubmit={create}>
        <Stack gap="sm">
          <TextInput
            label="Nombre de la regla"
            placeholder="Ej: Notificar al finalizar"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            required
            w={320}
          />

          <Group gap="sm" align="flex-end" wrap="wrap">
            <Select
              label="Evento"
              data={(Object.keys(EVENT_LABELS) as RuleEvent[]).map((ev) => ({
                value: ev,
                label: EVENT_LABELS[ev],
              }))}
              value={event}
              onChange={(v) => v && setEvent(v as RuleEvent)}
              allowDeselect={false}
              w={210}
            />
            {event === RuleEvent.ON_STATUS_CHANGED && (
              <>
                <Select
                  label="Desde (opcional)"
                  placeholder="Cualquier estado"
                  data={statusSelectData}
                  value={fromStatusId || null}
                  onChange={(v) => setFromStatusId(v ?? '')}
                  clearable
                  w={180}
                />
                <Select
                  label="Hacia (opcional)"
                  placeholder="Cualquier estado"
                  data={statusSelectData}
                  value={toStatusId || null}
                  onChange={(v) => setToStatusId(v ?? '')}
                  clearable
                  w={180}
                />
              </>
            )}
          </Group>

          <Text size="xs" c="dimmed">
            Condición (opcional): la acción solo se ejecuta si la actividad la cumple.
          </Text>
          <ConditionBuilder
            fieldOptions={customFieldOptions(fields)}
            condition={condition}
            onChange={setCondition}
            emptyFieldOption="— sin condición —"
          />

          <Group gap="sm" align="flex-end" wrap="wrap">
            <Select
              label="Acción"
              data={(Object.keys(ACTION_LABELS) as RuleActionType[]).map((a) => ({
                value: a,
                label: ACTION_LABELS[a],
              }))}
              value={actionType}
              onChange={(v) => v && setActionType(v as RuleActionType)}
              allowDeselect={false}
              w={210}
            />
            {actionType === RuleActionType.CHANGE_STATUS && (
              <Select
                label="Estado destino"
                placeholder="Selecciona..."
                data={statusSelectData}
                value={actionStatusId || null}
                onChange={(v) => setActionStatusId(v ?? '')}
                w={210}
              />
            )}
            {actionType === RuleActionType.ASSIGN_RESPONSIBLE && (
              <Select
                label="Usuario a notificar"
                placeholder="Selecciona..."
                data={(members ?? []).map((m) => ({
                  value: m.userId,
                  label: `${m.name} · ${m.role === UserRole.ADMIN ? 'Admin' : 'Gestor'}`,
                }))}
                value={actionResponsibleId || null}
                onChange={(v) => setActionResponsibleId(v ?? '')}
                searchable
                w={260}
              />
            )}
            {MESSAGE_ACTIONS.includes(actionType) && (
              <TextInput
                label="Mensaje / comentario"
                value={actionMessage}
                onChange={(e) => setActionMessage(e.currentTarget.value)}
                w={320}
              />
            )}
          </Group>

          {actionType === RuleActionType.ASSIGN_RESPONSIBLE && (
            <TextInput
              label="Mensaje a notificar"
              placeholder="Se enviará al activarse las notificaciones"
              value={actionMessage}
              onChange={(e) => setActionMessage(e.currentTarget.value)}
              w={420}
            />
          )}

          {actionType === RuleActionType.CREATE_CUSTOM_FIELD && (
            <Stack gap="sm">
              <Text size="sm" fw={600}>Campos a crear</Text>
              {cfDrafts.map((draft, i) => (
                <Stack
                  key={i}
                  gap="sm"
                  p="sm"
                  style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}
                >
                  <Group gap="sm" align="flex-end" wrap="nowrap">
                    <TextInput
                      label={`Etiqueta del campo ${i + 1}`}
                      placeholder="Ej: Evidencia"
                      value={draft.label}
                      onChange={(e) => updateDraft(i, { label: e.currentTarget.value })}
                      style={{ flex: 1 }}
                    />
                    {cfDrafts.length > 1 && (
                      <Tooltip label="Quitar campo" withArrow>
                        <ActionIcon color="red" variant="subtle" onClick={() => removeDraft(i)}>
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                  <Group gap="md" align="center" wrap="wrap">
                    <Select
                      label="Tipo"
                      data={(Object.keys(FIELD_TYPE_LABELS) as CustomFieldType[]).map((t) => ({
                        value: t,
                        label: FIELD_TYPE_LABELS[t],
                      }))}
                      value={draft.type}
                      onChange={(v) => v && updateDraft(i, { type: v as CustomFieldType })}
                      allowDeselect={false}
                      w={180}
                    />
                    <Checkbox
                      label="Obligatorio"
                      checked={draft.required}
                      onChange={(e) => updateDraft(i, { required: e.currentTarget.checked })}
                      mt="lg"
                    />
                  </Group>
                  {draft.type === CustomFieldType.LIST && (
                    <TextInput
                      label="Opciones"
                      placeholder="Separadas por coma (ej: Electrico, Fisico, Software)"
                      value={draft.optionsText}
                      onChange={(e) => updateDraft(i, { optionsText: e.currentTarget.value })}
                    />
                  )}
                </Stack>
              ))}
              <Button
                type="button"
                variant="light"
                leftSection={<IconPlus size={14} />}
                onClick={addDraft}
                style={{ alignSelf: 'flex-start' }}
              >
                Agregar otro campo
              </Button>
            </Stack>
          )}

          <Button type="submit" loading={busy} style={{ alignSelf: 'flex-start' }}>
            Crear automatización
          </Button>
        </Stack>
      </form>
    </Stack>
  );
}
