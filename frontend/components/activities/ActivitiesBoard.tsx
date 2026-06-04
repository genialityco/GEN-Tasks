'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Group,
  Text,
  Badge,
  Paper,
  Stack,
  Alert,
  Tooltip,
  Anchor,
  Box,
} from '@mantine/core';
import { IconCircleFilled } from '@tabler/icons-react';
import type { Activity, Project } from '@gen-task/shared';
import type { useActivitiesFilter } from '../../hooks/useActivitiesFilter';
import { activitiesApi } from '../../services/api/activities.api';
import {
  COMPLIANCE_COLOR,
  COMPLIANCE_LABEL,
  computeComplianceLevel,
  computeDeadline,
} from './activities.helpers';

type FilterApi = ReturnType<typeof useActivitiesFilter>;

/**
 * Vista tipo tablero (kanban): una columna por estado activo del proyecto y una
 * tarjeta por actividad (segun los filtros/sub-pestana actuales). Las tarjetas
 * se arrastran entre columnas para cambiar de estado (el backend valida las
 * restricciones y el flujo lineal).
 */
export function ActivitiesBoard({
  project,
  filter,
  detailHref,
  resolveResponsible = (id) => id,
  onChanged,
}: {
  project: Project;
  filter: FilterApi;
  detailHref: (activityId: string) => string;
  resolveResponsible?: (userId: string) => string;
  onChanged?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStatusId, setOverStatusId] = useState<string | null>(null);

  const statuses = useMemo(
    () =>
      project.statuses
        .filter((s) => s.isActive && !s.isArchived)
        .sort((a, b) => a.order - b.order),
    [project.statuses],
  );

  // Agrupa las actividades visibles por estado.
  const byStatus = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const s of statuses) map.set(s.id, []);
    for (const a of filter.boardFiltered) {
      const list = map.get(a.statusId);
      if (list) list.push(a);
    }
    return map;
  }, [statuses, filter.boardFiltered]);

  async function moveTo(activityId: string, statusId: string, currentStatusId: string) {
    if (statusId === currentStatusId) return;
    setError(null);
    try {
      await activitiesApi.changeStatus(activityId, statusId);
      onChanged?.();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Stack gap="sm">
      {error && (
        <Alert color="red" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Group align="flex-start" gap="md" wrap="nowrap" style={{ overflowX: 'auto', paddingBottom: 8 }}>
        {statuses.map((s) => {
          const cards = byStatus.get(s.id) ?? [];
          const isOver = overStatusId === s.id;
          return (
            <Paper
              key={s.id}
              withBorder
              radius="md"
              p="xs"
              style={{
                minWidth: 260,
                flex: '0 0 260px',
                background: isOver ? 'var(--mantine-color-blue-0)' : undefined,
                outline: isOver ? '2px dashed var(--mantine-color-blue-4)' : undefined,
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (overStatusId !== s.id) setOverStatusId(s.id);
              }}
              onDragLeave={() => setOverStatusId((cur) => (cur === s.id ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                setOverStatusId(null);
                const id = e.dataTransfer.getData('text/plain') || dragId;
                const dragged = filter.boardFiltered.find((a) => a.id === id);
                if (dragged) moveTo(dragged.id, s.id, dragged.statusId);
                setDragId(null);
              }}
            >
              <Group justify="space-between" mb="xs" wrap="nowrap">
                <Group gap={6} wrap="nowrap">
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: s.color ?? '#9CA3AF',
                      display: 'inline-block',
                    }}
                  />
                  <Text size="sm" fw={700}>{s.name}</Text>
                </Group>
                <Badge size="sm" variant="light" color="gray">{cards.length}</Badge>
              </Group>

              <Stack gap={8} mih={40}>
                {cards.map((a) => (
                  <BoardCard
                    key={a.id}
                    activity={a}
                    project={project}
                    filter={filter}
                    detailHref={detailHref}
                    resolveResponsible={resolveResponsible}
                    onDragStart={(e) => {
                      setDragId(a.id);
                      e.dataTransfer.setData('text/plain', a.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverStatusId(null);
                    }}
                  />
                ))}
                {cards.length === 0 && (
                  <Text size="xs" c="dimmed" ta="center" py="sm">Sin actividades</Text>
                )}
              </Stack>
            </Paper>
          );
        })}
        {statuses.length === 0 && (
          <Text c="dimmed">El proyecto no tiene estados configurados.</Text>
        )}
      </Group>
    </Stack>
  );
}

/** Tarjeta arrastrable de una actividad dentro del tablero. */
function BoardCard({
  activity,
  project,
  filter,
  detailHref,
  resolveResponsible,
  onDragStart,
  onDragEnd,
}: {
  activity: Activity;
  project: Project;
  filter: FilterApi;
  detailHref: (activityId: string) => string;
  resolveResponsible: (userId: string) => string;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
}) {
  const level = computeComplianceLevel(activity, project, filter.statusMap);
  const deadline = computeDeadline(activity, project);
  const responsibles = activity.responsibleIds.map(resolveResponsible).join(', ');

  return (
    <Paper
      withBorder
      radius="sm"
      p="xs"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{ cursor: 'grab', background: 'var(--mantine-color-body)' }}
    >
      <Group justify="space-between" gap={6} wrap="nowrap" mb={4}>
        <Anchor component={Link} href={detailHref(activity.id)} size="sm" fw={600} lineClamp={2}>
          {activity.name}
        </Anchor>
        {level && (
          <Tooltip label={COMPLIANCE_LABEL[level]} withArrow>
            <Box component="span" style={{ flexShrink: 0 }}>
              <IconCircleFilled size={12} color={COMPLIANCE_COLOR[level]} />
            </Box>
          </Tooltip>
        )}
      </Group>
      <Text size="xs" c="dimmed">{responsibles || 'Sin responsable'}</Text>
      {deadline && (
        <Text size="xs" c="dimmed">{deadline.toLocaleDateString('es-CO')}</Text>
      )}
    </Paper>
  );
}
