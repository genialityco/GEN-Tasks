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

  // Formulario de nueva restricción.
  const [condition, setCondition] = useState<ConditionDraft>({
    fieldKey: '',
    operator: ConditionOperator.IS_NOT_EMPTY,
    value: '',
  });
  const [toStatusId, setToStatusId] = useState<string>('');
  const [message, setMessage] = useState('');

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
    if (!condition.fieldKey) {
      setError('Selecciona un campo para la restricción.');
      return;
    }
    const guard: StatusTransitionGuard = {
      id: '',
      toStatusId: toStatusId || undefined,
      conditions: [
        {
          fieldKey: condition.fieldKey,
          operator: condition.operator,
          value: NEEDS_VALUE.includes(condition.operator) ? condition.value : undefined,
        },
      ],
      logicalOperator: LogicalOperator.AND,
      message: message.trim() || undefined,
    };
    await persist([...guards, guard]);
    setCondition({ fieldKey: '', operator: ConditionOperator.IS_NOT_EMPTY, value: '' });
    setToStatusId('');
    setMessage('');
  }

  async function removeGuard(id: string) {
    await persist(guards.filter((g) => g.id !== id));
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
        {guards.map((g) => {
          const c = g.conditions[0];
          const op = c?.operator as ConditionOperator | undefined;
          return (
            <Group
              key={g.id}
              justify="space-between"
              wrap="nowrap"
              gap="sm"
              p="xs"
              style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}
            >
              <Text size="sm">
                Para cambiar a <strong>{statusName(g.toStatusId)}</strong> se requiere que{' '}
                <strong>{c ? fieldLabel(c.fieldKey) : '—'}</strong>{' '}
                {op ? REQUIREMENT_OPERATOR_LABELS[op] : ''}{' '}
                {op && NEEDS_VALUE.includes(op) ? <em>{String(c?.value ?? '')}</em> : ''}
                {g.message ? ` — si no: “${g.message}”` : ''}
              </Text>
              <Tooltip label="Eliminar" withArrow>
                <ActionIcon color="red" variant="subtle" onClick={() => removeGuard(g.id)} disabled={busy}>
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
      <ConditionBuilder
        fieldOptions={fieldOptions}
        condition={condition}
        onChange={setCondition}
        operatorLabels={REQUIREMENT_OPERATOR_LABELS}
        fieldLabel="Campo a exigir"
      />
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
