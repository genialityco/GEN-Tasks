'use client';

import { useState } from 'react';
import {
  Paper,
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

/**
 * Etiquetas en clave de "requisito": la condición es lo que DEBE cumplirse para
 * permitir el cambio de estado. Redactadas como obligación para evitar la
 * confusión de configurarlas de forma invertida (ej: "debe tener un valor" para
 * exigir que un campo de archivo esté adjunto antes de avanzar).
 */
const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  EQUALS: 'debe ser igual a',
  NOT_EQUALS: 'debe ser distinto de',
  IN: 'debe estar en',
  NOT_IN: 'no debe estar en',
  IS_EMPTY: 'debe estar vacío',
  IS_NOT_EMPTY: 'debe tener un valor (no vacío)',
};

/** Operadores que requieren un valor de comparación. */
const NEEDS_VALUE: ConditionOperator[] = [
  ConditionOperator.EQUALS,
  ConditionOperator.NOT_EQUALS,
  ConditionOperator.IN,
  ConditionOperator.NOT_IN,
];

/**
 * Configura el flujo de estados del proyecto: activar/desactivar el flujo lineal
 * y administrar las restricciones de cambio de estado (transition guards), que
 * bloquean un cambio cuando una condición sobre un campo no se cumple. Solo
 * visible para ADMIN/SUPER_ADMIN (la pestaña de config ya lo restringe).
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
  const [fieldKey, setFieldKey] = useState<string>('');
  const [operator, setOperator] = useState<ConditionOperator>(
    ConditionOperator.IS_NOT_EMPTY,
  );
  const [value, setValue] = useState('');
  const [toStatusId, setToStatusId] = useState<string>('');
  const [message, setMessage] = useState('');

  const fieldOptions = [
    { value: 'statusId', label: 'Estado (statusId)' },
    { value: 'name', label: 'Nombre' },
    ...project.customFields
      .filter((f) => !f.isArchived)
      .map((f) => ({ value: f.key, label: f.label })),
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
    if (!fieldKey) {
      setError('Selecciona un campo para la restricción.');
      return;
    }
    const guard: StatusTransitionGuard = {
      id: '',
      toStatusId: toStatusId || undefined,
      conditions: [
        {
          fieldKey,
          operator,
          value: NEEDS_VALUE.includes(operator) ? value : undefined,
        },
      ],
      logicalOperator: LogicalOperator.AND,
      message: message.trim() || undefined,
    };
    await persist([...guards, guard]);
    setFieldKey('');
    setOperator(ConditionOperator.IS_NOT_EMPTY);
    setValue('');
    setToStatusId('');
    setMessage('');
  }

  async function removeGuard(id: string) {
    await persist(guards.filter((g) => g.id !== id));
  }

  const fieldLabel = (key: string) =>
    fieldOptions.find((o) => o.value === key)?.label ?? key;

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Text fw={700}>Flujo y restricciones de estado</Text>
        {error && <Alert color="red">{error}</Alert>}

        <Switch
          checked={!!project.linearStatusFlow}
          onChange={(e) => toggleLinear(e.currentTarget.checked)}
          disabled={busy}
          label="Flujo de estados lineal"
          description="Solo permite mover una actividad al estado inmediatamente anterior o siguiente (no saltar estados)."
        />

        <Divider my="xs" label="Restricciones de cambio de estado" labelPosition="left" />

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
                  {op ? OPERATOR_LABELS[op] : ''}{' '}
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
        <Group gap="sm" align="flex-end" wrap="wrap">
          <Select
            label="Campo"
            placeholder="Selecciona..."
            data={fieldOptions}
            value={fieldKey || null}
            onChange={(v) => setFieldKey(v ?? '')}
            w={200}
            searchable
          />
          <Select
            label="Requisito"
            data={Object.values(ConditionOperator).map((op) => ({
              value: op,
              label: OPERATOR_LABELS[op],
            }))}
            value={operator}
            onChange={(v) => v && setOperator(v as ConditionOperator)}
            w={160}
            allowDeselect={false}
          />
          {NEEDS_VALUE.includes(operator) && (
            <TextInput
              label="Valor"
              value={value}
              onChange={(e) => setValue(e.currentTarget.value)}
              w={160}
            />
          )}
          <Select
            label="Estado destino (opcional)"
            placeholder="Cualquier estado"
            data={statusOptions}
            value={toStatusId || null}
            onChange={(v) => setToStatusId(v ?? '')}
            clearable
            w={200}
          />
          <TextInput
            label="Mensaje al bloquear (opcional)"
            value={message}
            onChange={(e) => setMessage(e.currentTarget.value)}
            w={240}
          />
          <Button leftSection={<IconPlus size={14} />} onClick={addGuard} loading={busy}>
            Agregar
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
