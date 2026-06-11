'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Paper, Tabs, Title, Loader, Alert, Stack } from '@mantine/core';
import { useAuth } from '../../../../../services/auth/AuthProvider';
import {
  canViewProjectTab,
  roleInOrganization,
} from '../../../../../services/auth/roles';
import { useProject } from '../../../../../hooks/useProjects';
import { ActivitiesPanel } from '../../../../../components/activities/ActivitiesPanel';
import { GestoresPanel } from '../../../../../components/gestores/GestoresPanel';
import { HostsPanel } from '../../../../../components/hosts/HostsPanel';

type Tab = 'activities' | 'host' | 'gestores';

const TABS: { key: Tab; label: string }[] = [
  { key: 'activities', label: 'Actividades' },
  { key: 'host', label: 'Host' },
  { key: 'gestores', label: 'Gestores' },
];

export default function ProjectPage() {
  const params = useParams<{ organizationId: string; projectId: string }>();
  const { profile } = useAuth();
  const role = roleInOrganization(profile, params.organizationId);
  const [tab, setTab] = useState<Tab>('activities');

  const { data: project, loading, error, reload } = useProject(params.projectId);
  const visibleTabs = TABS.filter((t) => canViewProjectTab(role, t.key));

  // Refresca el proyecto cuando se guarda su configuracion desde el modal
  // del sidebar.
  useEffect(() => {
    function onProjectChanged(e: Event) {
      if ((e as CustomEvent<string>).detail === params.projectId) reload();
    }
    window.addEventListener('gt:project-changed', onProjectChanged);
    return () =>
      window.removeEventListener('gt:project-changed', onProjectChanged);
  }, [params.projectId, reload]);

  return (
    <main style={{ padding: 24 }}>
      <Stack gap="md">
        <Title order={2}>{project?.name ?? 'Proyecto'}</Title>

        {loading && <Loader color="blue" type="bars" />}
        {error && <Alert color="red">{error}</Alert>}

        {project && (
          <Paper p="md" shadow="sm" radius="md" withBorder>
            <Tabs value={tab} onChange={(v) => v && setTab(v as Tab)}>
              <Tabs.List mb="xl">
                {visibleTabs.map((t) => (
                  <Tabs.Tab key={t.key} value={t.key}>{t.label}</Tabs.Tab>
                ))}
              </Tabs.List>

              <Tabs.Panel value="activities">
                <ActivitiesPanel
                  project={project}
                  role={role}
                  organizationId={params.organizationId}
                  onProjectChanged={reload}
                />
              </Tabs.Panel>

              <Tabs.Panel value="host">
                <HostsPanel organizationId={params.organizationId} />
              </Tabs.Panel>

              <Tabs.Panel value="gestores">
                <GestoresPanel organizationId={params.organizationId} project={project} />
              </Tabs.Panel>
            </Tabs>
          </Paper>
        )}
      </Stack>
    </main>
  );
}
