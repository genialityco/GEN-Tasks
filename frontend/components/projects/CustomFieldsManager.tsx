'use client';

import { useState } from 'react';
import {
  Paper,
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
  Modal,
  MultiSelect,
} from '@mantine/core';
import {
  IconTrash,
  IconPlus,
  IconPencil,
  IconCheck,
  IconX,
  IconAdjustmentsHorizontal,
} from '@tabler/icons-react';
import {
  CustomFieldType,
  type ActivityCustomField,
  type ProjectStatus,
} from '@gen-task/shared';
import { projectsApi } from '../../services/api/projects.api';
import {
  FieldRulesEditor,
  buildFieldRulesPayload,
  emptyFieldRules,
  fitsSimpleEditor,
  parseFieldRules,
  type FieldRulesState,
} from './FieldRulesEditor';

const TYPE_LABELS: Record<CustomFieldType, string> = {
  TEXT: 'Texto',
  NUMBER: 'Numero',
  DATE: 'Fecha',
  FILE: 'Archivo',
  IMAGE: 'Imagen',
  VIDEO: 'Video',
  LIST: 'Lista',
  LINK: 'Enlace',
};

/**
 * Administra los campos personalizados del proyecto. Permite definir, por campo,
 * sus reglas de visibilidad (en qué estados se ve y bajo qué condición de valor)
 * y obligatoriedad por estado, para construir flujos de captura progresiva sin
 * depender de triggers. El tipo no se puede cambiar una vez creado (regla de
 * dominio). Crear/editar/eliminar están restringidos a ADMIN y SUPER_ADMIN.
 */
export function CustomFieldsManager({
  projectId,
  fields,
  statuses,
  onChanged,
}: {
  projectId: string;
  fields: ActivityCustomField[];
  statuses: ProjectStatus[];
  onChanged: () => void;
}) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<CustomFieldType>(CustomFieldType.TEXT);
  const [required, setRequired] = useState(false);
  const [optionsText, setOptionsText] = useState('');
  const [rules, setRules] = useState<FieldRulesState>(emptyFieldRules());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Renombrado inline (solo el nombre/label; la `key` permanece estable).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  // Edición de reglas de un campo existente (modal).
  const [rulesField, setRulesField] = useState<ActivityCustomField | null>(null);
  const [rulesDraft, setRulesDraft] = useState<FieldRulesState>(emptyFieldRules());
  const [rulesRequired, setRulesRequired] = useState(false);
  const [rulesBusy, setRulesBusy] = useState(false);
  const rulesAdvanced = rulesField ? !fitsSimpleEditor(rulesField) : false;

  function startRename(field: ActivityCustomField) {
    setEditingId(field.id);
    setEditLabel(field.label);
    setError(null);
  }

  function cancelRename() {
    setEditingId(null);
    setEditLabel('');
  }

  async function saveRename(fieldId: string) {
    const trimmed = editLabel.trim();
    if (!trimmed) return;
    setSavingId(fieldId);
    setError(null);
    try {
      await projectsApi.updateCustomField(projectId, fieldId, { label: trimmed });
      setEditingId(null);
      setEditLabel('');
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  function openRules(field: ActivityCustomField) {
    setRulesField(field);
    setRulesDraft(parseFieldRules(field));
    setRulesRequired(field.required);
    setError(null);
  }

  async function saveRules() {
    if (!rulesField) return;
    setRulesBusy(true);
    setError(null);
    try {
      const built = buildFieldRulesPayload(rulesDraft);
      await projectsApi.updateCustomField(projectId, rulesField.id, {
        required: rulesRequired,
        requiredOnStatuses: built.requiredOnStatuses,
        // Si el campo tiene condiciones avanzadas (creadas por una regla) no las
        // tocamos para no perder esa configuración.
        ...(rulesAdvanced
          ? {}
          : {
              visibilityConditions: built.visibilityConditions,
              visibilityLogicalOperator: built.visibilityLogicalOperator,
            }),
      });
      setRulesField(null);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRulesBusy(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const options =
        type === CustomFieldType.LIST
          ? optionsText
              .split(',')
              .map((o) => o.trim())
              .filter(Boolean)
              .map((o) => ({ label: o, value: o }))
          : undefined;
      const built = buildFieldRulesPayload(rules);
      await projectsApi.createCustomField(projectId, {
        label: label.trim(),
        type,
        required,
        options,
        ...(built.requiredOnStatuses.length
          ? { requiredOnStatuses: built.requiredOnStatuses }
          : {}),
        ...(built.visibilityConditions.length
          ? {
              visibilityConditions: built.visibilityConditions,
              visibilityLogicalOperator: built.visibilityLogicalOperator,
            }
          : {}),
      });
      setLabel('');
      setOptionsText('');
      setRequired(false);
      setType(CustomFieldType.TEXT);
      setRules(emptyFieldRules());
      setCreateOpen(false);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(field: ActivityCustomField) {
    if (!confirm(`¿Eliminar el campo "${field.label}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    setDeletingId(field.id);
    setError(null);
    try {
      await projectsApi.deleteCustomField(projectId, field.id);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  const visible = fields.filter((f) => !f.isArchived).sort((a, b) => a.order - b.order);
  const statusName = (id: string) => statuses.find((s) => s.id === id)?.name ?? id;

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={700}>Campos personalizados</Text>
          <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setCreateOpen(true)}>
            Nuevo campo
          </Button>
        </Group>
        {error && <Alert color="red">{error}</Alert>}

        <Stack gap={6}>
          {visible.map((f) => {
            const isEditing = editingId === f.id;
            const visibleCount = f.visibilityConditions?.length ?? 0;
            const requiredCount = f.requiredOnStatuses?.length ?? 0;
            return (
            <Group
              key={f.id}
              justify="space-between"
              wrap="nowrap"
              gap="sm"
              p="xs"
              style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}
            >
              {isEditing ? (
                <Group gap="xs" wrap="nowrap" style={{ flex: 1 }}>
                  <TextInput
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.currentTarget.value)}
                    size="xs"
                    style={{ flex: 1 }}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRename(f.id);
                      if (e.key === 'Escape') cancelRename();
                    }}
                  />
                  <Tooltip label="Guardar" withArrow>
                    <ActionIcon color="green" variant="light" loading={savingId === f.id} onClick={() => saveRename(f.id)}>
                      <IconCheck size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Cancelar" withArrow>
                    <ActionIcon color="gray" variant="light" onClick={cancelRename}>
                      <IconX size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              ) : (
                <Group gap="xs" wrap="wrap">
                  <Text>{f.label}</Text>
                  <Badge size="xs" variant="light" color="blue">{TYPE_LABELS[f.type]}</Badge>
                  {f.required && (
                    <Badge size="xs" variant="light" color="red">obligatorio</Badge>
                  )}
                  {!!f.options?.length && (
                    <Badge size="xs" variant="light" color="gray">{f.options.length} opciones</Badge>
                  )}
                  {visibleCount > 0 && (
                    <Badge size="xs" variant="light" color="grape">condicional</Badge>
                  )}
                  {requiredCount > 0 && (
                    <Badge size="xs" variant="light" color="orange">
                      obligatorio en {requiredCount} estado{requiredCount !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </Group>
              )}

              {!isEditing && (
                <Group gap="xs" wrap="nowrap">
                  <Tooltip label="Reglas de visibilidad" withArrow>
                    <ActionIcon variant="subtle" color="grape" onClick={() => openRules(f)}>
                      <IconAdjustmentsHorizontal size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Renombrar" withArrow>
                    <ActionIcon variant="subtle" color="blue" onClick={() => startRename(f)}>
                      <IconPencil size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Eliminar" withArrow>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      loading={deletingId === f.id}
                      onClick={() => remove(f)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              )}
            </Group>
            );
          })}
          {visible.length === 0 && (
            <Text c="dimmed" size="sm">Sin campos personalizados.</Text>
          )}
        </Stack>
      </Stack>

      {/* Crear campo */}
      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="Nuevo campo personalizado" centered size="lg">
        <form onSubmit={add}>
          <Stack gap="sm">
            {error && <Alert color="red">{error}</Alert>}
            <TextInput
              label="Etiqueta del campo"
              placeholder="Ej: Tipo de falla"
              value={label}
              onChange={(e) => setLabel(e.currentTarget.value)}
              required
              data-autofocus
            />
            <Select
              label="Tipo"
              value={type}
              onChange={(v) => v && setType(v as CustomFieldType)}
              data={(Object.keys(TYPE_LABELS) as CustomFieldType[]).map((t) => ({
                value: t,
                label: TYPE_LABELS[t],
              }))}
              allowDeselect={false}
            />
            <Checkbox
              label="Obligatorio (siempre)"
              checked={required}
              onChange={(e) => setRequired(e.currentTarget.checked)}
            />
            {type === CustomFieldType.LIST && (
              <TextInput
                label="Opciones"
                placeholder="Opciones separadas por coma (ej: Electrico, Fisico, Software)"
                value={optionsText}
                onChange={(e) => setOptionsText(e.currentTarget.value)}
              />
            )}

            <Text fw={600} size="sm" mt="xs">Reglas de visibilidad</Text>
            <FieldRulesEditor
              statuses={statuses}
              fields={fields}
              value={rules}
              onChange={setRules}
            />

            <Group gap="sm" justify="flex-end" mt="xs">
              <Button type="button" variant="default" onClick={() => setCreateOpen(false)} disabled={busy}>
                Cancelar
              </Button>
              <Button type="submit" loading={busy}>Agregar campo</Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Editar reglas de un campo existente */}
      <Modal
        opened={!!rulesField}
        onClose={() => setRulesField(null)}
        title={rulesField ? `Reglas de “${rulesField.label}”` : ''}
        centered
        size="lg"
      >
        <Stack gap="sm">
          {error && <Alert color="red">{error}</Alert>}
          {rulesAdvanced && (
            <Alert color="yellow">
              Este campo tiene condiciones de visibilidad avanzadas (probablemente creadas
              por una regla). Se conservan tal cual; aquí solo puedes ajustar la
              obligatoriedad.
            </Alert>
          )}
          <Checkbox
            label="Obligatorio (siempre)"
            checked={rulesRequired}
            onChange={(e) => setRulesRequired(e.currentTarget.checked)}
          />
          {!rulesAdvanced && rulesField && (
            <FieldRulesEditor
              statuses={statuses}
              fields={fields.filter((f) => f.id !== rulesField.id)}
              value={rulesDraft}
              onChange={setRulesDraft}
            />
          )}
          {rulesAdvanced && rulesField && (
            <MultiSelectRequiredOnly
              statuses={statuses}
              value={rulesDraft}
              onChange={setRulesDraft}
            />
          )}
          {rulesField && rulesDraft.visibleStatuses.length > 0 && !rulesAdvanced && (
            <Text size="xs" c="dimmed">
              Visible en: {rulesDraft.visibleStatuses.map(statusName).join(', ')}.
            </Text>
          )}
          <Group gap="sm" justify="flex-end" mt="xs">
            <Button variant="default" onClick={() => setRulesField(null)} disabled={rulesBusy}>
              Cancelar
            </Button>
            <Button onClick={saveRules} loading={rulesBusy}>Guardar reglas</Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}

/**
 * Para campos con visibilidad avanzada: solo permite editar "obligatorio en
 * estados" sin tocar las condiciones de visibilidad existentes.
 */
function MultiSelectRequiredOnly({
  statuses,
  value,
  onChange,
}: {
  statuses: ProjectStatus[];
  value: FieldRulesState;
  onChange: (next: FieldRulesState) => void;
}) {
  const statusData = statuses
    .filter((s) => !s.isArchived)
    .sort((a, b) => a.order - b.order)
    .map((s) => ({ value: s.id, label: s.name }));
  return (
    <MultiSelect
      label="Obligatorio en estados"
      placeholder="Ninguno"
      data={statusData}
      value={value.requiredStatuses}
      onChange={(v) => onChange({ ...value, requiredStatuses: v })}
      clearable
      searchable
    />
  );
}
