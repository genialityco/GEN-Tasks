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
  NEEDS_VALUE,
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
 * Borrador de una accion de la regla. Una regla puede tener varias acciones; cada
 * una guarda todos sus posibles parametros y solo se usa el que aplica a su tipo.
 */
interface ActionDraft {
  type: RuleActionType;
  /** Mensaje/comentario (SEND_WHATSAPP, REQUEST_HOST_INFORMATION, REGISTER_HISTORY_EVENT, ASSIGN_RESPONSIBLE). */
  message: string;
  /** Estado destino (CHANGE_STATUS). */
  statusId: string;
  /** Usuario a notificar/asignar (ASSIGN_RESPONSIBLE). */
  responsibleId: string;
  /** Campos a crear (CREATE_CUSTOM_FIELD). */
  cfDrafts: FieldDraft[];
}

function emptyActionDraft(): ActionDraft {
  return {
    type: RuleActionType.REGISTER_HISTORY_EVENT,
    message: '',
    statusId: '',
    responsibleId: '',
    cfDrafts: [emptyFieldDraft()],
  };
}

/** Convierte un borrador de accion al formato que espera el backend ({ type, payload }). */
function buildActionPayload(a: ActionDraft): {
  type: RuleActionType;
  payload: Record<string, unknown>;
} {
  const payload: Record<string, unknown> = {};
  if (MESSAGE_ACTIONS.includes(a.type)) {
    payload.message = a.message;
  }
  if (a.type === RuleActionType.CHANGE_STATUS) {
    payload.statusId = a.statusId;
  }
  if (a.type === RuleActionType.ASSIGN_RESPONSIBLE) {
    payload.responsibleId = a.responsibleId;
    // Mensaje que se notificara al responsable asignado.
    payload.message = a.message;
  }
  if (a.type === RuleActionType.CREATE_CUSTOM_FIELD) {
    payload.fields = a.cfDrafts
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
  return { type: a.type, payload };
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
  // Una regla puede combinar varias condiciones (Y/O).
  const emptyCondition = (): ConditionDraft => ({
    fieldKey: '',
    operator: ConditionOperator.EQUALS,
    value: '',
  });
  const [conditions, setConditions] = useState<ConditionDraft[]>([emptyCondition()]);
  const [conditionOperator, setConditionOperator] = useState<LogicalOperator>(
    LogicalOperator.AND,
  );
  // Transicion opcional para el evento "Al cambiar de estado".
  const [fromStatusId, setFromStatusId] = useState('');
  const [toStatusId, setToStatusId] = useState('');
  // Una regla puede ejecutar varias acciones; cada una se edita por separado.
  const [actions, setActions] = useState<ActionDraft[]>([emptyActionDraft()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeStatuses = statuses.filter((s) => !s.isArchived);
  const statusSelectData = activeStatuses.map((s) => ({ value: s.id, label: s.name }));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const builtConditions = conditions
        .filter((c) => c.fieldKey)
        .map((c) => ({
          fieldKey: c.fieldKey,
          operator: c.operator,
          value: NEEDS_VALUE.includes(c.operator) ? c.value || undefined : undefined,
        }));
      await rulesApi.create(projectId, {
        name: name.trim(),
        event,
        conditions: builtConditions,
        logicalOperator: conditionOperator,
        actions: actions.map(buildActionPayload),
        // La transicion solo aplica al evento de cambio de estado.
        ...(event === RuleEvent.ON_STATUS_CHANGED
          ? {
              fromStatusId: fromStatusId || undefined,
              toStatusId: toStatusId || undefined,
            }
          : {}),
      });
      setName('');
      setConditions([emptyCondition()]);
      setConditionOperator(LogicalOperator.AND);
      setFromStatusId('');
      setToStatusId('');
      setActions([emptyActionDraft()]);
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

  // --- Condiciones ---
  function updateCondition(index: number, next: ConditionDraft) {
    setConditions((prev) => prev.map((c, i) => (i === index ? next : c)));
  }
  function addCondition() {
    setConditions((prev) => [...prev, emptyCondition()]);
  }
  function removeCondition(index: number) {
    setConditions((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  // --- Borradores de acciones ---
  function updateAction(index: number, patch: Partial<ActionDraft>) {
    setActions((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }
  function addAction() {
    setActions((prev) => [...prev, emptyActionDraft()]);
  }
  function removeAction(index: number) {
    setActions((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  // --- Borradores de campos dentro de una accion CREATE_CUSTOM_FIELD ---
  function updateDraft(actionIndex: number, draftIndex: number, patch: Partial<FieldDraft>) {
    setActions((prev) =>
      prev.map((a, i) =>
        i === actionIndex
          ? {
              ...a,
              cfDrafts: a.cfDrafts.map((d, j) => (j === draftIndex ? { ...d, ...patch } : d)),
            }
          : a,
      ),
    );
  }
  function addDraft(actionIndex: number) {
    setActions((prev) =>
      prev.map((a, i) =>
        i === actionIndex ? { ...a, cfDrafts: [...a.cfDrafts, emptyFieldDraft()] } : a,
      ),
    );
  }
  function removeDraft(actionIndex: number, draftIndex: number) {
    setActions((prev) =>
      prev.map((a, i) =>
        i === actionIndex && a.cfDrafts.length > 1
          ? { ...a, cfDrafts: a.cfDrafts.filter((_, j) => j !== draftIndex) }
          : a,
      ),
    );
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

          {conditions.length > 1 && (
            <Select
              label="Combinar condiciones"
              description="Y = deben cumplirse todas · O = basta con una."
              data={[
                { value: LogicalOperator.AND, label: 'Y (todas)' },
                { value: LogicalOperator.OR, label: 'O (cualquiera)' },
              ]}
              value={conditionOperator}
              onChange={(v) => v && setConditionOperator(v as LogicalOperator)}
              allowDeselect={false}
              w={210}
            />
          )}

          {conditions.map((c, i) => (
            <Group key={i} gap="sm" align="flex-end" wrap="nowrap">
              <ConditionBuilder
                fieldOptions={customFieldOptions(fields)}
                condition={c}
                onChange={(next) => updateCondition(i, next)}
                emptyFieldOption="— sin condición —"
              />
              {conditions.length > 1 && (
                <Tooltip label="Quitar condición" withArrow>
                  <ActionIcon color="red" variant="subtle" onClick={() => removeCondition(i)} mb={6}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
          ))}

          <Button
            type="button"
            variant="light"
            leftSection={<IconPlus size={14} />}
            onClick={addCondition}
            style={{ alignSelf: 'flex-start' }}
          >
            Agregar otra condición
          </Button>

          <Text size="sm" fw={600}>Acciones</Text>
          <Text size="xs" c="dimmed">
            Todas las acciones se ejecutan, en orden, cuando la regla se dispara.
          </Text>

          {actions.map((act, ai) => (
            <Stack
              key={ai}
              gap="sm"
              p="sm"
              style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}
            >
              <Group gap="sm" align="flex-end" wrap="wrap">
                <Select
                  label={`Acción ${ai + 1}`}
                  data={(Object.keys(ACTION_LABELS) as RuleActionType[]).map((a) => ({
                    value: a,
                    label: ACTION_LABELS[a],
                  }))}
                  value={act.type}
                  onChange={(v) => v && updateAction(ai, { type: v as RuleActionType })}
                  allowDeselect={false}
                  w={210}
                />
                {act.type === RuleActionType.CHANGE_STATUS && (
                  <Select
                    label="Estado destino"
                    placeholder="Selecciona..."
                    data={statusSelectData}
                    value={act.statusId || null}
                    onChange={(v) => updateAction(ai, { statusId: v ?? '' })}
                    w={210}
                  />
                )}
                {act.type === RuleActionType.ASSIGN_RESPONSIBLE && (
                  <Select
                    label="Usuario a notificar"
                    placeholder="Selecciona..."
                    data={(members ?? []).map((m) => ({
                      value: m.userId,
                      label: `${m.name} · ${m.role === UserRole.ADMIN ? 'Admin' : 'Gestor'}`,
                    }))}
                    value={act.responsibleId || null}
                    onChange={(v) => updateAction(ai, { responsibleId: v ?? '' })}
                    searchable
                    w={260}
                  />
                )}
                {MESSAGE_ACTIONS.includes(act.type) && (
                  <TextInput
                    label="Mensaje / comentario"
                    value={act.message}
                    onChange={(e) => updateAction(ai, { message: e.currentTarget.value })}
                    w={320}
                  />
                )}
                {actions.length > 1 && (
                  <Tooltip label="Quitar acción" withArrow>
                    <ActionIcon
                      color="red"
                      variant="subtle"
                      onClick={() => removeAction(ai)}
                      mb={6}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </Group>

              {act.type === RuleActionType.ASSIGN_RESPONSIBLE && (
                <TextInput
                  label="Mensaje a notificar"
                  placeholder="Se enviará al responsable por WhatsApp"
                  value={act.message}
                  onChange={(e) => updateAction(ai, { message: e.currentTarget.value })}
                  w={420}
                />
              )}

              {act.type === RuleActionType.CREATE_CUSTOM_FIELD && (
                <Stack gap="sm">
                  <Text size="sm" fw={600}>Campos a crear</Text>
                  {act.cfDrafts.map((draft, i) => (
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
                          onChange={(e) => updateDraft(ai, i, { label: e.currentTarget.value })}
                          style={{ flex: 1 }}
                        />
                        {act.cfDrafts.length > 1 && (
                          <Tooltip label="Quitar campo" withArrow>
                            <ActionIcon
                              color="red"
                              variant="subtle"
                              onClick={() => removeDraft(ai, i)}
                            >
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
                          onChange={(v) => v && updateDraft(ai, i, { type: v as CustomFieldType })}
                          allowDeselect={false}
                          w={180}
                        />
                        <Checkbox
                          label="Obligatorio"
                          checked={draft.required}
                          onChange={(e) => updateDraft(ai, i, { required: e.currentTarget.checked })}
                          mt="lg"
                        />
                      </Group>
                      {draft.type === CustomFieldType.LIST && (
                        <TextInput
                          label="Opciones"
                          placeholder="Separadas por coma (ej: Electrico, Fisico, Software)"
                          value={draft.optionsText}
                          onChange={(e) => updateDraft(ai, i, { optionsText: e.currentTarget.value })}
                        />
                      )}
                    </Stack>
                  ))}
                  <Button
                    type="button"
                    variant="light"
                    leftSection={<IconPlus size={14} />}
                    onClick={() => addDraft(ai)}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    Agregar otro campo
                  </Button>
                </Stack>
              )}
            </Stack>
          ))}

          <Button
            type="button"
            variant="light"
            leftSection={<IconPlus size={14} />}
            onClick={addAction}
            style={{ alignSelf: 'flex-start' }}
          >
            Agregar otra acción
          </Button>

          <Button type="submit" loading={busy} style={{ alignSelf: 'flex-start' }}>
            Crear automatización
          </Button>
        </Stack>
      </form>
    </Stack>
  );
}
