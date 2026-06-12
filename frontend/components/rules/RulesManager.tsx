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
  Alert,
  Tooltip,
  Modal,
  MultiSelect,
} from '@mantine/core';
import { IconTrash, IconPlus, IconPencil } from '@tabler/icons-react';
import {
  ConditionOperator,
  CustomFieldType,
  LogicalOperator,
  NotificationChannel,
  RuleActionType,
  RuleEvent,
  UserRole,
  WhatsappRecipientType,
  type ActivityCustomField,
  type OrganizationMember,
  type ProjectRule,
  type ProjectStatus,
  type RuleAction,
} from '@gen-task/shared';
import { rulesApi } from '../../services/api/rules.api';
import { organizationsApi } from '../../services/api/organizations.api';
import { useAsync } from '../../hooks/useAsync';
import { useToast } from '../toast/ToastProvider';
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

/** Acciones de WhatsApp que permiten elegir destinatario. */
const WHATSAPP_RECIPIENT_ACTIONS: RuleActionType[] = [
  RuleActionType.SEND_WHATSAPP,
  RuleActionType.REQUEST_HOST_INFORMATION,
];

/** Etiquetas de los tipos de destinatario de las acciones de WhatsApp. */
const RECIPIENT_LABELS: Record<WhatsappRecipientType, string> = {
  HOST: 'Host de la actividad',
  MEMBER: 'Un miembro de la organización',
  RESPONSIBLES: 'Responsables de la actividad',
  PHONE: 'Teléfono manual',
};

/** Etiquetas de los canales por los que se puede notificar al responsable. */
const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Correo',
  BOTH: 'Ambos',
};

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
  /** Usuarios a notificar/asignar (ASSIGN_RESPONSIBLE; admite varios). */
  responsibleIds: string[];
  /** Destinatario MEMBER de WhatsApp (uno solo). */
  responsibleId: string;
  /** Tipo de destinatario (SEND_WHATSAPP / REQUEST_HOST_INFORMATION). */
  recipientType: WhatsappRecipientType;
  /** Telefono fijo cuando el destinatario es PHONE. */
  recipientPhone: string;
  /** Canal por el que se notifica al responsable (ASSIGN_RESPONSIBLE). */
  notificationChannel: NotificationChannel;
  /** Campos a crear (CREATE_CUSTOM_FIELD). */
  cfDrafts: FieldDraft[];
}

function emptyActionDraft(): ActionDraft {
  return {
    type: RuleActionType.REGISTER_HISTORY_EVENT,
    message: '',
    statusId: '',
    responsibleIds: [],
    responsibleId: '',
    recipientType: WhatsappRecipientType.HOST,
    recipientPhone: '',
    notificationChannel: NotificationChannel.WHATSAPP,
    cfDrafts: [emptyFieldDraft()],
  };
}

function emptyCondition(): ConditionDraft {
  return { fieldKey: '', operator: ConditionOperator.EQUALS, value: '' };
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
  if (WHATSAPP_RECIPIENT_ACTIONS.includes(a.type)) {
    payload.recipientType = a.recipientType;
    if (a.recipientType === WhatsappRecipientType.MEMBER) {
      payload.recipientUserId = a.responsibleId;
    }
    if (a.recipientType === WhatsappRecipientType.PHONE) {
      payload.recipientPhone = a.recipientPhone.trim();
    }
  }
  if (a.type === RuleActionType.CHANGE_STATUS) {
    payload.statusId = a.statusId;
  }
  if (a.type === RuleActionType.ASSIGN_RESPONSIBLE) {
    payload.responsibleIds = a.responsibleIds;
    // Mensaje que se notificara a los responsables asignados.
    payload.message = a.message;
    // Canal de notificacion elegido en la regla (WhatsApp / Correo / Ambos).
    payload.notificationChannel = a.notificationChannel;
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

/** Reconstruye un borrador de campo desde el payload guardado (CREATE_CUSTOM_FIELD). */
function fieldToDraft(f: Record<string, unknown>): FieldDraft {
  const options = Array.isArray(f.options)
    ? (f.options as { label?: string; value?: string }[])
    : [];
  return {
    label: typeof f.label === 'string' ? f.label : '',
    type: (f.type as CustomFieldType) ?? CustomFieldType.TEXT,
    required: Boolean(f.required),
    optionsText: options
      .map((o) => o.label ?? o.value ?? '')
      .filter(Boolean)
      .join(', '),
  };
}

/** Reconstruye un borrador de accion desde una accion guardada (mapeo inverso de `buildActionPayload`). */
function actionToDraft(a: RuleAction): ActionDraft {
  const p = (a.payload ?? {}) as Record<string, unknown>;
  const fields = Array.isArray(p.fields)
    ? (p.fields as Record<string, unknown>[])
    : [];
  return {
    ...emptyActionDraft(),
    type: a.type,
    message: typeof p.message === 'string' ? p.message : '',
    statusId: typeof p.statusId === 'string' ? p.statusId : '',
    // Notificar a (varios): formato actual `responsibleIds`, o el `responsibleId`
    // unico de reglas antiguas.
    responsibleIds: Array.isArray(p.responsibleIds)
      ? (p.responsibleIds as string[])
      : typeof p.responsibleId === 'string'
        ? [p.responsibleId]
        : [],
    // Destinatario MEMBER de WhatsApp (uno solo).
    responsibleId:
      typeof p.recipientUserId === 'string' ? p.recipientUserId : '',
    recipientType:
      (p.recipientType as WhatsappRecipientType) ?? WhatsappRecipientType.HOST,
    recipientPhone: typeof p.recipientPhone === 'string' ? p.recipientPhone : '',
    notificationChannel:
      (p.notificationChannel as NotificationChannel) ?? NotificationChannel.WHATSAPP,
    cfDrafts: fields.length ? fields.map(fieldToDraft) : [emptyFieldDraft()],
  };
}

/**
 * Seccion de automatizaciones (triggers) del proyecto. Lista las reglas existentes
 * (con editar/eliminar) y abre un modal con el formulario para crear una nueva o
 * editar una existente. La evaluacion y ejecucion la realiza el motor de reglas del
 * backend al crear/cambiar estado. Se embebe dentro de `ProjectRulesConfig` (no
 * dibuja su propia tarjeta) y comparte el editor de condiciones con las
 * restricciones de estado.
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
  const toast = useToast();

  // null = modal cerrado · 'new' = crear · ProjectRule = editar esa regla.
  const [editTarget, setEditTarget] = useState<ProjectRule | 'new' | null>(null);

  /** Nombre legible de un estado por id (vacio si no se especifica). */
  const statusName = (id?: string) =>
    id ? statuses.find((s) => s.id === id)?.name ?? id : '';

  async function remove(ruleId: string) {
    try {
      await rulesApi.remove(projectId, ruleId);
      toast.success('Automatización eliminada.');
      reload();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Stack gap="sm">
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
            <Group gap={4} wrap="nowrap">
              <Tooltip label="Editar" withArrow>
                <ActionIcon variant="subtle" onClick={() => setEditTarget(r)}>
                  <IconPencil size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Eliminar" withArrow>
                <ActionIcon color="red" variant="subtle" onClick={() => remove(r.id)}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        ))}
        {rules && rules.length === 0 && (
          <Text size="sm" c="dimmed">Sin automatizaciones configuradas.</Text>
        )}
      </Stack>

      <Button
        leftSection={<IconPlus size={14} />}
        onClick={() => setEditTarget('new')}
        style={{ alignSelf: 'flex-start' }}
      >
        Nueva automatización
      </Button>

      {/* Se monta solo al abrir: asi el formulario siembra sus valores desde la
          regla seleccionada en cada apertura (crear con null, o editar). */}
      {editTarget !== null && (
        <RuleFormModal
          rule={editTarget === 'new' ? null : editTarget}
          projectId={projectId}
          members={members ?? []}
          fields={fields}
          statuses={statuses}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            reload();
          }}
        />
      )}
    </Stack>
  );
}

/**
 * Modal con el formulario de una automatizacion. Sirve para crear (rule = null) y
 * para editar (rule = la regla). Al montarse siembra su estado desde `rule`; el
 * Modal de Mantine desmonta el contenido al cerrarse, asi que cada apertura arranca
 * con los valores correctos.
 */
function RuleFormModal({
  rule,
  projectId,
  members,
  fields,
  statuses,
  onClose,
  onSaved,
}: {
  rule: ProjectRule | null;
  projectId: string;
  members: OrganizationMember[];
  fields: ActivityCustomField[];
  statuses: ProjectStatus[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isEdit = rule !== null;

  const [name, setName] = useState(rule?.name ?? '');
  const [event, setEvent] = useState<RuleEvent>(rule?.event ?? RuleEvent.ON_STATUS_CHANGED);
  const [conditions, setConditions] = useState<ConditionDraft[]>(
    rule && rule.conditions.length
      ? rule.conditions.map((c) => ({
          fieldKey: c.fieldKey,
          operator: c.operator as ConditionOperator,
          value: c.value == null ? '' : String(c.value),
        }))
      : [emptyCondition()],
  );
  const [conditionOperator, setConditionOperator] = useState<LogicalOperator>(
    rule?.logicalOperator ?? LogicalOperator.AND,
  );
  const [fromStatusId, setFromStatusId] = useState(rule?.fromStatusId ?? '');
  const [toStatusId, setToStatusId] = useState(rule?.toStatusId ?? '');
  const [actions, setActions] = useState<ActionDraft[]>(
    rule && rule.actions.length ? rule.actions.map(actionToDraft) : [emptyActionDraft()],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeStatuses = statuses.filter((s) => !s.isArchived);
  const statusSelectData = activeStatuses.map((s) => ({ value: s.id, label: s.name }));

  async function submit(e: React.FormEvent) {
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
      const body = {
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
      };
      if (isEdit && rule) {
        await rulesApi.update(projectId, rule.id, body);
        toast.success('Automatización actualizada.');
      } else {
        await rulesApi.create(projectId, body);
        toast.success('Automatización creada.');
      }
      onSaved();
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
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
    <Modal
      opened
      onClose={onClose}
      title={isEdit ? 'Editar automatización' : 'Nueva automatización'}
      centered
      size="xl"
    >
      <form onSubmit={submit}>
        <Stack gap="sm">
          {error && <Alert color="red">{error}</Alert>}

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
                  <>
                    <MultiSelect
                      label="Usuarios a notificar"
                      placeholder={act.responsibleIds.length ? '' : 'Selecciona uno o varios...'}
                      data={members.map((m) => ({
                        value: m.userId,
                        label: `${m.name} · ${m.role === UserRole.ADMIN ? 'Admin' : 'Gestor'}`,
                      }))}
                      value={act.responsibleIds}
                      onChange={(v) => updateAction(ai, { responsibleIds: v })}
                      searchable
                      clearable
                      w={320}
                    />
                    <Select
                      label="Notificar por"
                      data={(
                        Object.keys(NOTIFICATION_CHANNEL_LABELS) as NotificationChannel[]
                      ).map((c) => ({ value: c, label: NOTIFICATION_CHANNEL_LABELS[c] }))}
                      value={act.notificationChannel}
                      onChange={(v) =>
                        v && updateAction(ai, { notificationChannel: v as NotificationChannel })
                      }
                      allowDeselect={false}
                      w={160}
                    />
                  </>
                )}
                {WHATSAPP_RECIPIENT_ACTIONS.includes(act.type) && (
                  <Select
                    label="Enviar a"
                    data={(Object.keys(RECIPIENT_LABELS) as WhatsappRecipientType[]).map(
                      (t) => ({ value: t, label: RECIPIENT_LABELS[t] }),
                    )}
                    value={act.recipientType}
                    onChange={(v) =>
                      v && updateAction(ai, { recipientType: v as WhatsappRecipientType })
                    }
                    allowDeselect={false}
                    w={240}
                  />
                )}
                {WHATSAPP_RECIPIENT_ACTIONS.includes(act.type) &&
                  act.recipientType === WhatsappRecipientType.MEMBER && (
                    <Select
                      label="Miembro"
                      placeholder="Selecciona..."
                      data={members.map((m) => ({
                        value: m.userId,
                        label: `${m.name} · ${m.role === UserRole.ADMIN ? 'Admin' : 'Gestor'}`,
                      }))}
                      value={act.responsibleId || null}
                      onChange={(v) => updateAction(ai, { responsibleId: v ?? '' })}
                      searchable
                      w={260}
                    />
                  )}
                {WHATSAPP_RECIPIENT_ACTIONS.includes(act.type) &&
                  act.recipientType === WhatsappRecipientType.PHONE && (
                    <TextInput
                      label="Teléfono"
                      placeholder="Ej: 573001234567"
                      value={act.recipientPhone}
                      onChange={(e) =>
                        updateAction(ai, { recipientPhone: e.currentTarget.value })
                      }
                      w={200}
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

          <Group justify="flex-end" gap="sm" mt="xs">
            <Button variant="default" type="button" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" loading={busy}>
              {isEdit ? 'Guardar cambios' : 'Crear automatización'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
