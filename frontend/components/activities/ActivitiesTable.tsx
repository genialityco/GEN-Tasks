'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Table,
  Group,
  Text,
  Badge,
  Popover,
  ActionIcon,
  Checkbox,
  Stack,
  Button,
  Tooltip,
  Alert,
  Select,
  Anchor,
} from '@mantine/core';
import {
  IconFilter,
  IconCircleFilled,
  IconPencil,
  IconColumns3,
  IconX,
} from '@tabler/icons-react';
import {
  CustomFieldType,
  isFieldVisibleForActivity,
  UserRole,
  type Activity,
  type OrganizationMember,
  type Project,
} from '@gen-task/shared';
import type { useActivitiesFilter } from '../../hooks/useActivitiesFilter';
import { projectsApi } from '../../services/api/projects.api';
import { activitiesApi } from '../../services/api/activities.api';
import { attachmentsSummary } from './FileFieldUploader';
import { isFileField } from './InlineCellEditor';
import {
  COMPLIANCE_COLOR,
  COMPLIANCE_LABEL,
  computeComplianceLevel,
  computeDeadline,
  deadlineRemainingLabel,
  getActivityFieldValue,
  statusColor,
  statusName,
} from './activities.helpers';
import { SortIcon } from './SortIcon';
import { InlineCellEditor, isInlineEditableColumn } from './InlineCellEditor';

type FilterApi = ReturnType<typeof useActivitiesFilter>;

interface Column {
  key: string;
  label: string;
  sortable: boolean;
  /** Si la columna admite filtro por valores unicos (popover de checkboxes). */
  filterable: boolean;
  render: (activity: Activity) => React.ReactNode;
}

/**
 * Tabla de actividades estilo Motorola: cabeceras ordenables, filtros por
 * columna (incluido responsable), filtro de fecha, semaforo de cumplimiento en
 * la columna de programacion, edicion rapida y enlace a detalle.
 */
export function ActivitiesTable({
  project,
  filter,
  detailHref,
  resolveResponsible = (id) => id,
  members = [],
  onQuickEdit,
  role = null,
  onChanged,
  onProjectChanged,
}: {
  project: Project;
  filter: FilterApi;
  detailHref: (activityId: string) => string;
  resolveResponsible?: (userId: string) => string;
  members?: OrganizationMember[];
  onQuickEdit?: (activity: Activity) => void;
  role?: UserRole | null;
  /** Recarga de actividades tras una edicion inline. */
  onChanged?: () => void;
  /** Recarga del proyecto tras cambiar la configuracion de columnas. */
  onProjectChanged?: () => void;
}) {
  // Edicion inline: celda en edicion y errores devueltos por el backend.
  const [editing, setEditing] = useState<{ activityId: string; colKey: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Ocultar columnas (ADMIN/SUPER_ADMIN).
  // Ocultar columnas (ADMIN/SUPER_ADMIN).
  const canManageColumns = role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
  const hiddenKeys = project.hiddenColumnKeys ?? [];

  const allColumns = useMemo<Column[]>(() => {
    const base: Column[] = [
      { key: 'name', label: 'Nombre', sortable: true, filterable: false, render: (a) => a.name },
      {
        key: 'status',
        label: 'Estado',
        sortable: true,
        filterable: true,
        render: (a) => (
          <Badge size="sm" color={statusColor(project, a.statusId)}>
            {statusName(project, a.statusId)}
          </Badge>
        ),
      },
      {
        key: 'responsibles',
        label: 'Responsable',
        sortable: false,
        filterable: false,
        render: (a) =>
          a.responsibleIds.map(resolveResponsible).join(', ') || '—',
      },
      {
        key: 'createdAt',
        label: 'Creación',
        sortable: true,
        filterable: false,
        render: (a) => new Date(a.createdAt).toLocaleDateString('es-CO'),
      },
      {
        key: 'scheduledDate',
        label: 'Programación',
        sortable: true,
        filterable: false,
        render: (a) => <ProgramacionCell activity={a} project={project} filter={filter} />,
      },
    ];
    const custom: Column[] = project.customFields
      .filter((f) => f.isActive && !f.isArchived)
      .map((f) => ({
        key: `cf_${f.key}`,
        label: f.label,
        sortable: true,
        filterable: f.type === CustomFieldType.LIST,
        render: (a: Activity) => {
          const v = a.customFieldValues?.[f.key];
          if (isFileField(f.type)) return attachmentsSummary(v);
          if (v == null || v === '') return '—';
          if (f.type === CustomFieldType.LINK) {
            const url = String(v);
            return (
              <Anchor href={url} target="_blank" rel="noopener noreferrer" size="sm" lineClamp={1}>
                {url}
              </Anchor>
            );
          }
          return String(v);
        },
      }));
    return [...base, ...custom];
  }, [project, resolveResponsible, filter]);

  // Columnas visibles (excluye las ocultas por configuracion del proyecto).
  const columns = useMemo(
    () => allColumns.filter((c) => !hiddenKeys.includes(c.key)),
    [allColumns, hiddenKeys],
  );

  // Alterna la visibilidad de una columna y persiste en el proyecto.
  async function toggleColumn(key: string, visible: boolean) {
    const next = visible
      ? hiddenKeys.filter((k) => k !== key)
      : [...hiddenKeys, key];
    setError(null);
    try {
      await projectsApi.update(project.id, { hiddenColumnKeys: next });
      onProjectChanged?.();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // Valores unicos por columna filtrable, calculados sobre el universo completo.
  const uniqueValues = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const col of columns) {
      if (!col.filterable) continue;
      map[col.key] = [
        ...new Set(filter.sorted.map((a) => getActivityFieldValue(a, project, col.key)).filter(Boolean)),
      ].sort();
    }
    return map;
  }, [columns, filter.sorted, project]);

  const dateFilterActive = !!filter.filterFechaFrom || !!filter.filterFechaTo;
  const totalCols = columns.length + 1;

  // Editor inline para responsables (usa `members` del scope)
  function InlineResponsibleEditor({ activity, onDone }: { activity: Activity; onDone: (err?: string, changed?: boolean) => void }) {
    const [selected, setSelected] = useState<string[]>(activity.responsibleIds ?? []);
    const [saving, setSaving] = useState(false);

    const available = members.filter((m) => !selected.includes(m.userId));

    async function save() {
      setSaving(true);
      try {
        await activitiesApi.update(activity.id, { responsibleIds: selected });
        onDone(undefined, true);
      } catch (err) {
        onDone((err as Error).message, false);
      } finally {
        setSaving(false);
      }
    }

    return (
      <div>
        <Group gap={6} mb="xs" wrap="wrap">
          {selected.length === 0 && <Text size="xs" c="dimmed">Sin responsables</Text>}
          {selected.map((id) => {
            const m = members.find((mm) => mm.userId === id);
            return (
              <Group key={id} gap={4} style={{ paddingRight: 6 }}>
                <Badge size="xs">{m ? m.name : id}</Badge>
                <ActionIcon size="xs" onClick={() => setSelected((s) => s.filter((x) => x !== id))}>
                  <IconX size={12} />
                </ActionIcon>
              </Group>
            );
          })}
        </Group>

        <Group gap={6} mb="xs">
          <Select
            size="xs"
            placeholder="Agregar responsable..."
            data={available.map((m) => ({ value: m.userId, label: m.name }))}
            onChange={(v) => v && setSelected((s) => [...s, v])}
          />
        </Group>

        <Group style={{ justifyContent: 'flex-end' }}>
          <Button size="xs" variant="default" onClick={() => onDone()}>
            Cancelar
          </Button>
          <Button size="xs" loading={saving} onClick={save}>
            Guardar
          </Button>
        </Group>
      </div>
    );
  }

  return (
    <>
      {error && (
        <Alert color="red" mb="sm" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {canManageColumns && (
        <Group justify="flex-end" mb="xs">
          <Popover withArrow shadow="md" position="bottom-end" withinPortal>
            <Popover.Target>
              <Button size="xs" variant="light" leftSection={<IconColumns3 size={14} />}>
                Columnas
              </Button>
            </Popover.Target>
            <Popover.Dropdown>
              <Text size="xs" fw={700} mb="xs">Columnas visibles</Text>
              <Stack gap={6}>
                {allColumns.map((c) => (
                  <Checkbox
                    key={c.key}
                    size="xs"
                    label={c.label}
                    checked={!hiddenKeys.includes(c.key)}
                    onChange={(e) => toggleColumn(c.key, e.currentTarget.checked)}
                  />
                ))}
              </Stack>
            </Popover.Dropdown>
          </Popover>
        </Group>
      )}

      <Table striped highlightOnHover style={{ tableLayout: 'auto' }}>
      <Table.Thead>
        <Table.Tr>
          {columns.map((col) => (
            <Table.Th key={col.key}>
              <Group gap={4} wrap="nowrap">
                <Group
                  gap={4}
                  wrap="nowrap"
                  style={{ cursor: col.sortable ? 'pointer' : 'default' }}
                  onClick={() => col.sortable && filter.handleSort(col.key)}
                >
                  <Text size="sm" fw={600}>{col.label}</Text>
                  {col.sortable && (
                    <SortIcon sortCol={filter.sortCol} sortDir={filter.sortDir} col={col.key} />
                  )}
                </Group>

                {col.key === 'createdAt' && (
                  <Popover withArrow shadow="md" position="bottom-start" withinPortal>
                    <Popover.Target>
                      <Tooltip label={dateFilterActive ? 'Filtro activo' : 'Filtrar por fecha'} withArrow>
                        <ActionIcon size="xs" variant="subtle" color={dateFilterActive ? 'blue' : 'gray'}>
                          <IconFilter size={13} />
                        </ActionIcon>
                      </Tooltip>
                    </Popover.Target>
                    <Popover.Dropdown>
                      <Stack gap="xs">
                        <Text size="xs" fw={700}>Rango de creación</Text>
                        <input
                          type="date"
                          className="gt-input"
                          value={filter.filterFechaFrom}
                          onChange={(e) => { filter.setFilterFechaFrom(e.target.value); filter.setPage(1); }}
                        />
                        <input
                          type="date"
                          className="gt-input"
                          value={filter.filterFechaTo}
                          onChange={(e) => { filter.setFilterFechaTo(e.target.value); filter.setPage(1); }}
                        />
                        {dateFilterActive && (
                          <Button
                            size="xs"
                            variant="subtle"
                            color="red"
                            onClick={() => {
                              filter.setFilterFechaFrom('');
                              filter.setFilterFechaTo('');
                              filter.setPage(1);
                            }}
                          >
                            Limpiar
                          </Button>
                        )}
                      </Stack>
                    </Popover.Dropdown>
                  </Popover>
                )}

                {col.key === 'responsibles' && members.length > 0 && (
                  <Popover withArrow shadow="md" position="bottom-start" withinPortal>
                    <Popover.Target>
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        color={filter.filterResponsibles.length > 0 ? 'blue' : 'gray'}
                      >
                        <IconFilter size={13} />
                      </ActionIcon>
                    </Popover.Target>
                    <Popover.Dropdown>
                      <Text size="xs" fw={700} mb="xs">Responsable</Text>
                      <Checkbox.Group
                        value={filter.filterResponsibles}
                        onChange={filter.setResponsibleFilter}
                      >
                        <Stack gap={6}>
                          {members.map((m) => (
                            <Checkbox key={m.userId} value={m.userId} label={m.name} size="xs" />
                          ))}
                        </Stack>
                      </Checkbox.Group>
                      {filter.filterResponsibles.length > 0 && (
                        <Button
                          size="xs"
                          variant="subtle"
                          color="red"
                          mt="xs"
                          onClick={() => filter.setResponsibleFilter([])}
                        >
                          Limpiar
                        </Button>
                      )}
                    </Popover.Dropdown>
                  </Popover>
                )}

                {col.filterable && (
                  <Popover withArrow shadow="md" position="bottom-start" withinPortal>
                    <Popover.Target>
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        color={(filter.filterFields[col.key]?.length || 0) > 0 ? 'blue' : 'gray'}
                      >
                        <IconFilter size={13} />
                      </ActionIcon>
                    </Popover.Target>
                    <Popover.Dropdown>
                      <Text size="xs" fw={700} mb="xs">{col.label}</Text>
                      {(uniqueValues[col.key] || []).length === 0 ? (
                        <Text size="xs" c="dimmed">Sin datos</Text>
                      ) : (
                        <Checkbox.Group
                          value={filter.filterFields[col.key] || []}
                          onChange={(vals) => filter.setFieldFilter(col.key, vals)}
                        >
                          <Stack gap={6}>
                            {(uniqueValues[col.key] || []).map((v) => (
                              <Checkbox key={v} value={v} label={v} size="xs" />
                            ))}
                          </Stack>
                        </Checkbox.Group>
                      )}
                      {(filter.filterFields[col.key]?.length || 0) > 0 && (
                        <Button
                          size="xs"
                          variant="subtle"
                          color="red"
                          mt="xs"
                          onClick={() => filter.setFieldFilter(col.key, [])}
                        >
                          Limpiar
                        </Button>
                      )}
                    </Popover.Dropdown>
                  </Popover>
                )}
              </Group>
            </Table.Th>
          ))}
          <Table.Th><Text size="sm" fw={600}>Acciones</Text></Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {filter.paginated.map((activity) => (
          <Table.Tr key={activity.id}>
            {columns.map((col) => {
              const isEditing =
                editing?.activityId === activity.id && editing?.colKey === col.key;
              // Campo personalizado oculto para esta actividad por su
              // visibilidad condicional: no aplica, no editable.
              const cfField = col.key.startsWith('cf_')
                ? project.customFields.find((f) => f.key === col.key.slice(3))
                : undefined;
              const fieldHidden =
                !!cfField &&
                !isFieldVisibleForActivity(cfField, {
                  statusId: activity.statusId,
                  customFieldValues: activity.customFieldValues,
                });
              const editable =
                !fieldHidden && isInlineEditableColumn(col.key, project);
              const isFileField =
                !fieldHidden &&
                col.key.startsWith('cf_') &&
                !editable &&
                !!cfField;
              return (
                <Table.Td
                  key={col.key}
                  style={{ cursor: (editable || isFileField || (col.key === 'responsibles' && members.length > 0)) ? 'pointer' : undefined }}
                    onDoubleClick={() => {
                      if (isEditing) return;
                      setError(null);
                      if (col.key === 'responsibles' && members.length > 0) {
                        // Usar editor inline para responsables
                        setEditing({ activityId: activity.id, colKey: 'responsibles' });
                      } else if (editable) {
                        setEditing({ activityId: activity.id, colKey: col.key });
                      } else if (isFileField) {
                        onQuickEdit?.(activity);
                      }
                    }}
                >
                  {fieldHidden ? (
                    <Text c="dimmed" size="sm">—</Text>
                  ) : isEditing ? (
                    col.key === 'responsibles' ? (
                      <InlineResponsibleEditor
                        activity={activity}
                        onDone={(err, changed) => {
                          setEditing(null);
                          if (err) setError(err);
                          else if (changed) onChanged?.();
                        }}
                      />
                    ) : (
                      <InlineCellEditor
                        activity={activity}
                        project={project}
                        columnKey={col.key}
                        onDone={(err, changed) => {
                          setEditing(null);
                          if (err) setError(err);
                          else if (changed) onChanged?.();
                        }}
                      />
                    )
                  ) : (
                    col.render(activity)
                  )}
                </Table.Td>
              );
            })}
            <Table.Td>
              <Group gap="xs" wrap="nowrap">
                <Button component={Link} href={detailHref(activity.id)} size="xs" variant="light">
                  Ver Detalle
                </Button>
              </Group>
            </Table.Td>
          </Table.Tr>
        ))}
        {filter.paginated.length === 0 && (
          <Table.Tr>
            <Table.Td colSpan={totalCols} ta="center" c="dimmed">
              No hay actividades para estos filtros.
            </Table.Td>
          </Table.Tr>
        )}
      </Table.Tbody>
    </Table>
      
    </>
  );
}

/** Celda de programación: fecha límite + semáforo de cumplimiento. */
function ProgramacionCell({
  activity,
  project,
  filter,
}: {
  activity: Activity;
  project: Project;
  filter: FilterApi;
}) {
  const deadline = computeDeadline(activity, project);
  const level = computeComplianceLevel(activity, project, filter.statusMap);

  if (!deadline) return <span>—</span>;

  return (
    <Group gap={6} wrap="nowrap">
      {level && (
        <Tooltip label={COMPLIANCE_LABEL[level]} withArrow>
          <IconCircleFilled size={12} color={COMPLIANCE_COLOR[level]} />
        </Tooltip>
      )}
      <div>
        <Text size="sm">{deadline.toLocaleDateString('es-CO')}</Text>
        {level && (
          <Text size="xs" c="dimmed">{deadlineRemainingLabel(deadline)}</Text>
        )}
      </div>
    </Group>
  );
}
