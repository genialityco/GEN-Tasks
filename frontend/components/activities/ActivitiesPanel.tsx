'use client';

import { useMemo, useState } from 'react';
import {
  Group,
  Title,
  Button,
  Tabs,
  Badge,
  Select,
  Text,
  Pagination,
  Loader,
  Alert,
  Modal,
  SegmentedControl,
} from '@mantine/core';
import { UserRole } from '@gen-task/shared';
import type { Activity, Project } from '@gen-task/shared';
import { useActivities } from '../../hooks/useActivities';
import { useActivitiesFilter } from '../../hooks/useActivitiesFilter';
import { useAsync } from '../../hooks/useAsync';
import { organizationsApi } from '../../services/api/organizations.api';
import { ActivitiesTable } from './ActivitiesTable';
import { ActivitiesBoard } from './ActivitiesBoard';
import { CreateActivityForm } from './CreateActivityForm';
import { QuickEditActivityModal } from './QuickEditActivityModal';
import { ExcelToolbar } from './ExcelToolbar';
import { countBySubTab } from './activities.helpers';

/**
 * Panel de actividades estilo Motorola (equivalente a `TicketsTab`):
 * sub-pestanas por estado con conteos, tabla con orden/filtros, paginacion y
 * creacion inline. Carga todas las actividades (incluidas archivadas) y filtra
 * del lado del cliente.
 */
export function ActivitiesPanel({
  project,
  role,
  organizationId,
  onProjectChanged,
}: {
  project: Project;
  role: UserRole | null;
  organizationId: string;
  /** Recarga del proyecto tras cambiar su configuracion (ej: columnas ocultas). */
  onProjectChanged?: () => void;
}) {
  const { data: activities, loading, error, reload } = useActivities(project.id, {
    includeArchived: true,
  });
  const [creating, setCreating] = useState(false);
  const [quickEdit, setQuickEdit] = useState<Activity | null>(null);
  const [view, setView] = useState<'tabla' | 'tablero'>('tabla');

  const list = activities ?? [];
  const filter = useActivitiesFilter(list, project);
  const counts = useMemo(() => countBySubTab(list, filter.statusMap), [list, filter.statusMap]);

  // Miembros de la organizacion para mostrar nombres de responsables.
  const { data: members } = useAsync(
    () => organizationsApi.members(organizationId),
    [organizationId],
  );
  const resolveResponsible = useMemo(() => {
    const map = new Map((members ?? []).map((m) => [m.userId, m.name]));
    return (userId: string) => map.get(userId) ?? userId;
  }, [members]);

  const detailHref = (activityId: string) =>
    `/organizations/${organizationId}/projects/${project.id}/activities/${activityId}`;

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={3}>Gestor de Actividades</Title>
        <Group gap="sm">
          <SegmentedControl
            value={view}
            onChange={(v) => setView(v as 'tabla' | 'tablero')}
            data={[
              { label: 'Tabla', value: 'tabla' },
              { label: 'Tablero', value: 'tablero' },
            ]}
            size="xs"
          />
          {(role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN) && (
            <ExcelToolbar
              projectId={project.id}
              projectName={project.name}
              onImported={reload}
            />
          )}
          {!creating && (
            <Button onClick={() => setCreating(true)}>Nueva actividad</Button>
          )}
        </Group>
      </Group>

      <Modal
        opened={creating}
        onClose={() => setCreating(false)}
        title="Nueva actividad"
        centered
      >
        <CreateActivityForm
          project={project}
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            reload();
          }}
        />
      </Modal>

      <QuickEditActivityModal
        activity={quickEdit}
        project={project}
        onClose={() => setQuickEdit(null)}
        onSaved={reload}
      />

      {view === 'tabla' && (
      <Tabs
        value={filter.subTab}
        onChange={(v) => { if (v) { filter.setSubTab(v as typeof filter.subTab); filter.setPage(1); } }}
        my="lg"
      >
        <Tabs.List>
          <Tabs.Tab value="activos">
            Activas
            <Badge size="xs" ml={6} color="blue" variant="light">{counts.activos}</Badge>
          </Tabs.Tab>
          <Tabs.Tab value="finalizados">
            Finalizadas
            <Badge size="xs" ml={6} color="green" variant="light">{counts.finalizados}</Badge>
          </Tabs.Tab>
          <Tabs.Tab value="archivados">
            Archivadas
            <Badge size="xs" ml={6} color="yellow" variant="light">{counts.archivados}</Badge>
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>
      )}

      {loading && <Loader color="blue" type="bars" />}
      {error && <Alert color="red" mb="md">{error}</Alert>}

      {!loading && view === 'tabla' && (
        <ActivitiesTable
          project={project}
          filter={filter}
          detailHref={detailHref}
          resolveResponsible={resolveResponsible}
          members={members ?? []}
          onQuickEdit={setQuickEdit}
          role={role}
          onChanged={reload}
          onProjectChanged={onProjectChanged}
        />
      )}

      {!loading && view === 'tablero' && (
        <ActivitiesBoard
          project={project}
          filter={filter}
          detailHref={detailHref}
          resolveResponsible={resolveResponsible}
          onChanged={reload}
        />
      )}

      {view === 'tabla' && (
      <Group justify="space-between" mt="lg" align="center" wrap="wrap" gap="sm">
        <Group gap="xs" align="center">
          <Text size="sm" c="dimmed">
            {filter.sorted.length === 0
              ? 'Sin actividades'
              : `Mostrando ${filter.startIdx}–${filter.endIdx} de ${filter.sorted.length} actividad${filter.sorted.length !== 1 ? 'es' : ''}`}
          </Text>
          <Select
            value={filter.pageSize}
            onChange={(val) => { if (val) { filter.setPageSize(val); filter.setPage(1); } }}
            data={['5', '10', '20', '50']}
            size="xs"
            w={72}
            allowDeselect={false}
          />
          <Text size="sm" c="dimmed">por página</Text>
        </Group>
        <Pagination total={filter.totalPages} value={filter.page} onChange={filter.setPage} size="sm" />
      </Group>
      )}

      <Text size="xs" c="dimmed" mt="sm">Rol en esta organización: {role ?? '—'}</Text>
    </>
  );
}
