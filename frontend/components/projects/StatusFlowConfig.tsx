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
  Modal,
} from '@mantine/core';
import { IconTrash, IconPlus, IconPencil } from '@tabler/icons-react';
import {
  ConditionOperator,
  LogicalOperator,
  type Project,
  type StatusTransitionGuard,
} from '@gen-task/shared';
import { projectsApi } from '../../services/api/projects.api';
import { useToast } from '../toast/ToastProvider';
import {
  ConditionBuilder,
  customFieldOptions,
  NEEDS_VALUE,
  REQUIREMENT_OPERATOR_LABELS,
  type ConditionDraft,
  type FieldOption,
} from './ConditionBuilder';

function emptyCondition(): ConditionDraft {
  return { fieldKey: '', operator: ConditionOperator.IS_NOT_EMPTY, value: '' };
}

/**
 * Seccion de restricciones (bloqueos) del flujo de estados: activar/desactivar el
 * flujo lineal y administrar las restricciones de cambio de estado (transition
 * guards), que bloquean un cambio cuando una condicion sobre un campo no se
 * cumple. Lista las restricciones (con editar/eliminar) y abre un modal con el
 * formulario para crear o editar. Se embebe dentro de `ProjectRulesConfig` (no
 * dibuja su propia tarjeta). Solo visible para ADMIN/SUPER_ADMIN (la pestana de
 * config ya lo restringe).
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
  const toast = useToast();

  // null = modal cerrado · 'new' = crear · { index, guard } = editar esa restriccion.
  const [editTarget, setEditTarget] = useState<
    { index: number; guard: StatusTransitionGuard } | 'new' | null
  >(null);

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

  // Borrado por posición: robusto aunque varios guards compartan id (datos
  // antiguos creados antes de que el backend asignara ids únicos).
  async function removeGuard(index: number) {
    setBusy(true);
    setError(null);
    try {
      await projectsApi.update(project.id, {
        transitionGuards: guards.filter((_, i) => i !== index),
      });
      toast.success('Restricción eliminada.');
      onChanged();
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
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
              <Group gap={4} wrap="nowrap">
                <Tooltip label="Editar" withArrow>
                  <ActionIcon
                    variant="subtle"
                    onClick={() => setEditTarget({ index: idx, guard: g })}
                    disabled={busy}
                  >
                    <IconPencil size={16} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Eliminar" withArrow>
                  <ActionIcon color="red" variant="subtle" onClick={() => removeGuard(idx)} disabled={busy}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>
          );
        })}
        {guards.length === 0 && (
          <Text size="sm" c="dimmed">Sin restricciones configuradas.</Text>
        )}
      </Stack>

      <Button
        leftSection={<IconPlus size={14} />}
        onClick={() => setEditTarget('new')}
        style={{ alignSelf: 'flex-start' }}
      >
        Nueva restricción
      </Button>

      {/* Se monta solo al abrir: asi el formulario siembra sus valores desde la
          restricción seleccionada en cada apertura (crear con null, o editar). */}
      {editTarget !== null && (
        <GuardFormModal
          guard={editTarget !== 'new' ? editTarget.guard : null}
          editIndex={editTarget !== 'new' ? editTarget.index : null}
          guards={guards}
          projectId={project.id}
          fieldOptions={fieldOptions}
          statusOptions={statusOptions}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            onChanged();
          }}
        />
      )}
    </Stack>
  );
}

/**
 * Modal con el formulario de una restricción (transition guard). Sirve para crear
 * (guard = null) y para editar (guard = la restricción). Las restricciones se
 * guardan dentro del proyecto (`transitionGuards`), asi que al guardar se reescribe
 * el array completo: se añade al final (crear) o se reemplaza la posición
 * `editIndex` conservando su id (editar).
 */
function GuardFormModal({
  guard,
  editIndex,
  guards,
  projectId,
  fieldOptions,
  statusOptions,
  onClose,
  onSaved,
}: {
  guard: StatusTransitionGuard | null;
  editIndex: number | null;
  guards: StatusTransitionGuard[];
  projectId: string;
  fieldOptions: FieldOption[];
  statusOptions: { value: string; label: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isEdit = guard !== null;

  const [conditions, setConditions] = useState<ConditionDraft[]>(
    guard && guard.conditions.length
      ? guard.conditions.map((c) => ({
          fieldKey: c.fieldKey,
          operator: c.operator as ConditionOperator,
          value: c.value == null ? '' : String(c.value),
        }))
      : [emptyCondition()],
  );
  const [logicalOperator, setLogicalOperator] = useState<LogicalOperator>(
    guard?.logicalOperator ?? LogicalOperator.AND,
  );
  const [toStatusId, setToStatusId] = useState<string>(guard?.toStatusId ?? '');
  const [message, setMessage] = useState(guard?.message ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateCondition(index: number, next: ConditionDraft) {
    setConditions((prev) => prev.map((c, i) => (i === index ? next : c)));
  }
  function addCondition() {
    setConditions((prev) => [...prev, emptyCondition()]);
  }
  function removeCondition(index: number) {
    setConditions((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const valid = conditions.filter((c) => c.fieldKey);
    if (valid.length === 0) {
      setError('Selecciona al menos un campo para la restricción.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next: StatusTransitionGuard = {
        // Conserva el id al editar; vacio al crear (el backend asigna uno).
        id: guard?.id ?? '',
        toStatusId: toStatusId || undefined,
        conditions: valid.map((c) => ({
          fieldKey: c.fieldKey,
          operator: c.operator,
          value: NEEDS_VALUE.includes(c.operator) ? c.value : undefined,
        })),
        logicalOperator,
        message: message.trim() || undefined,
      };
      const nextGuards =
        editIndex == null
          ? [...guards, next]
          : guards.map((g, i) => (i === editIndex ? next : g));
      await projectsApi.update(projectId, { transitionGuards: nextGuards });
      toast.success(isEdit ? 'Restricción actualizada.' : 'Restricción creada.');
      onSaved();
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      opened
      onClose={onClose}
      title={isEdit ? 'Editar restricción' : 'Nueva restricción'}
      centered
      size="lg"
    >
      <form onSubmit={submit}>
        <Stack gap="sm">
          {error && <Alert color="red">{error}</Alert>}

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
            type="button"
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
          </Group>

          <Group justify="flex-end" gap="sm" mt="xs">
            <Button variant="default" type="button" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" loading={busy}>
              {isEdit ? 'Guardar cambios' : 'Agregar restricción'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
