'use client';

import { useState } from 'react';
import {
  Stack,
  Group,
  Text,
  Switch,
  Select,
  TextInput,
  Button,
  ActionIcon,
  Alert,
  Tooltip,
  Divider,
} from '@mantine/core';
import { IconTrash, IconPlus } from '@tabler/icons-react';
import {
  ConditionOperator,
  LogicalOperator,
  type Project,
  type StatusTransitionGuard,
} from '@gen-task/shared';
import { projectsApi } from '../../services/api/projects.api';
import {
  ConditionBuilder,
  customFieldOptions,
  NEEDS_VALUE,
  REQUIREMENT_OPERATOR_LABELS,
  type ConditionDraft,
  type FieldOption,
} from './ConditionBuilder';

/**
 * Seccion de restricciones (bloqueos) del flujo de estados: activar/desactivar el
 * flujo lineal y administrar las restricciones de cambio de estado (transition
 * guards), que bloquean un cambio cuando una condicion sobre un campo no se
 * cumple. Se embebe dentro de `ProjectRulesConfig` (no dibuja su propia tarjeta).
 * Solo visible para ADMIN/SUPER_ADMIN (la pestana de config ya lo restringe).
 */
export function StatusFlowConfig({
  project,
  onChanged,
}: {
  project: Project;
  onChanged: () => void;
}) {
  const guards = project.transitionGuards ?? [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Formulario de nueva restricción: una o varias condiciones combinadas.
  const emptyCondition = (): ConditionDraft => ({
    fieldKey: '',
    operator: ConditionOperator.IS_NOT_EMPTY,
    value: '',
  });
  const [conditions, setConditions] = useState<ConditionDraft[]>([emptyCondition()]);
  const [logicalOperator, setLogicalOperator] = useState<LogicalOperator>(
    LogicalOperator.AND,
  );
  const [toStatusId, setToStatusId] = useState<string>('');
  const [message, setMessage] = useState('');

  function updateCondition(index: number, next: ConditionDraft) {
    setConditions((prev) => prev.map((c, i) => (i === index ? next : c)));
  }
  function addCondition() {
    setConditions((prev) => [...prev, emptyCondition()]);
  }
  function removeCondition(index: number) {
    setConditions((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  // Campos disponibles para la condición: estado/nombre + campos personalizados.
  const fieldOptions: FieldOption[] = [
    { value: 'statusId', label: 'Estado (statusId)' },
    { value: 'name', label: 'Nombre' },
    ...customFieldOptions(project.customFields),
  ];

  const statusOptions = project.statuses
    .filter((s) => !s.isArchived)
    .sort((a, b) => a.order - b.order)
    .map((s) => ({ value: s.id, label: s.name }));

  const statusName = (id?: string) =>
    id ? project.statuses.find((s) => s.id === id)?.name ?? id : 'cualquier estado';

  async function persist(nextGuards: StatusTransitionGuard[]) {
    setBusy(true);
    setError(null);
    try {
      await projectsApi.update(project.id, { transitionGuards: nextGuards });
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleLinear(enabled: boolean) {
    setBusy(true);
    setError(null);
    try {
      await projectsApi.update(project.id, { linearStatusFlow: enabled });
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addGuard() {
    const valid = conditions.filter((c) => c.fieldKey);
    if (valid.length === 0) {
      setError('Selecciona al menos un campo para la restricción.');
      return;
    }
    const guard: StatusTransitionGuard = {
      id: '',
      toStatusId: toStatusId || undefined,
      conditions: valid.map((c) => ({
        fieldKey: c.fieldKey,
        operator: c.operator,
        value: NEEDS_VALUE.includes(c.operator) ? c.value : undefined,
      })),
      logicalOperator,
      message: message.trim() || undefined,
    };
    await persist([...guards, guard]);
    setConditions([emptyCondition()]);
    setLogicalOperator(LogicalOperator.AND);
    setToStatusId('');
    setMessage('');
  }

  // Borrado por posición: robusto aunque varios guards compartan id (datos
  // antiguos creados antes de que el backend asignara ids únicos).
  async function removeGuard(index: number) {
    await persist(guards.filter((_, i) => i !== index));
  }

  const fieldLabel = (key: string) =>
    fieldOptions.find((o) => o.value === key)?.label ?? key;

  return (
    <Stack gap="sm">
      {error && <Alert color="red">{error}</Alert>}

      <Switch
        checked={!!project.linearStatusFlow}
        onChange={(e) => toggleLinear(e.currentTarget.checked)}
        disabled={busy}
        label="Flujo de estados lineal"
        description="Solo permite mover una actividad al estado inmediatamente anterior o siguiente (no saltar estados)."
      />

      <Text size="xs" c="dimmed">
        Cada restricción define un <strong>requisito</strong> que debe cumplirse para
        permitir el cambio. Ej.: para exigir que un archivo esté adjunto antes de avanzar,
        usa <em>“debe tener un valor (no vacío)”</em>.
      </Text>

      <Stack gap={6}>
        {guards.map((g, idx) => {
          const joiner = g.logicalOperator === LogicalOperator.OR ? ' o ' : ' y ';
          const parts = g.conditions.map((c) => {
            const op = c.operator as ConditionOperator;
            const val =
              NEEDS_VALUE.includes(op) ? ` ${String(c.value ?? '')}` : '';
            return `${fieldLabel(c.fieldKey)} ${REQUIREMENT_OPERATOR_LABELS[op]}${val}`;
          });
          return (
            <Group
              key={g.id || idx}
              justify="space-between"
              wrap="nowrap"
              gap="sm"
              p="xs"
              style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}
            >
              <Text size="sm">
                Para cambiar a <strong>{statusName(g.toStatusId)}</strong> se requiere que{' '}
                <strong>{parts.join(joiner) || '—'}</strong>
                {g.message ? ` — si no: “${g.message}”` : ''}
              </Text>
              <Tooltip label="Eliminar" withArrow>
                <ActionIcon color="red" variant="subtle" onClick={() => removeGuard(idx)} disabled={busy}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          );
        })}
        {guards.length === 0 && (
          <Text size="sm" c="dimmed">Sin restricciones configuradas.</Text>
        )}
      </Stack>

      <Divider my="xs" variant="dashed" />

      <Text size="sm" fw={600}>Nueva restricción</Text>

      {conditions.length > 1 && (
        <Select
          label="Combinar condiciones"
          description="Y = deben cumplirse todas · O = basta con una."
          data={[
            { value: LogicalOperator.AND, label: 'Y (todas)' },
            { value: LogicalOperator.OR, label: 'O (cualquiera)' },
          ]}
          value={logicalOperator}
          onChange={(v) => v && setLogicalOperator(v as LogicalOperator)}
          allowDeselect={false}
          w={210}
        />
      )}

      {conditions.map((c, i) => (
        <Group key={i} gap="sm" align="flex-end" wrap="nowrap">
          <ConditionBuilder
            fieldOptions={fieldOptions}
            condition={c}
            onChange={(next) => updateCondition(i, next)}
            operatorLabels={REQUIREMENT_OPERATOR_LABELS}
            fieldLabel={conditions.length > 1 ? `Campo a exigir ${i + 1}` : 'Campo a exigir'}
          />
          {conditions.length > 1 && (
            <Tooltip label="Quitar campo" withArrow>
              <ActionIcon color="red" variant="subtle" onClick={() => removeCondition(i)} mb={6}>
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      ))}

      <Button
        variant="light"
        leftSection={<IconPlus size={14} />}
        onClick={addCondition}
        style={{ alignSelf: 'flex-start' }}
      >
        Agregar otro campo
      </Button>

      <Group gap="sm" align="flex-end" wrap="wrap">
        <Select
          label="Estado destino (opcional)"
          placeholder="Cualquier estado"
          data={statusOptions}
          value={toStatusId || null}
          onChange={(v) => setToStatusId(v ?? '')}
          clearable
          w={210}
        />
        <TextInput
          label="Mensaje al bloquear (opcional)"
          value={message}
          onChange={(e) => setMessage(e.currentTarget.value)}
          w={260}
        />
        <Button leftSection={<IconPlus size={14} />} onClick={addGuard} loading={busy}>
          Agregar restricción
        </Button>
      </Group>
    </Stack>
  );
}
