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
import { useOrganization } from '../../../../../hooks/useOrganizations';
import { ActivitiesPanel } from '../../../../../components/activities/ActivitiesPanel';
import { GestoresPanel } from '../../../../../components/gestores/GestoresPanel';
import { HostsPanel } from '../../../../../components/hosts/HostsPanel';
import { ProjectContactsPanel } from '../../../../../components/contacts/ProjectContactsPanel';

type Tab = 'activities' | 'host' | 'gestores' | 'contacts';

const TABS: { key: Tab; label: string }[] = [
  { key: 'activities', label: 'Actividades' },
  { key: 'host', label: 'Host' },
  { key: 'gestores', label: 'Gestores' },
  { key: 'contacts', label: 'Contactos' },
];

export default function ProjectPage() {
  const params = useParams<{ organizationId: string; projectId: string }>();
  const { profile } = useAuth();
  const role = roleInOrganization(profile, params.organizationId);
  const [tab, setTab] = useState<Tab>('activities');

  const { data: project, loading, error, reload } = useProject(params.projectId);
  const { data: organization } = useOrganization(params.organizationId);
  const contactsEnabled =
    organization?.enabledFeatures.contactsEnabled ?? false;
  const visibleTabs = TABS.filter((t) => {
    if (t.key === 'contacts' && !contactsEnabled) return false;
    return canViewProjectTab(role, t.key);
  });

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
                  contactsEnabled={contactsEnabled}
                  onProjectChanged={reload}
                />
              </Tabs.Panel>

              <Tabs.Panel value="host">
                <HostsPanel organizationId={params.organizationId} />
              </Tabs.Panel>

              <Tabs.Panel value="gestores">
                <GestoresPanel organizationId={params.organizationId} project={project} />
              </Tabs.Panel>

              {contactsEnabled && (
                <Tabs.Panel value="contacts">
                  <ProjectContactsPanel
                    organizationId={params.organizationId}
                    projectId={params.projectId}
                  />
                </Tabs.Panel>
              )}
            </Tabs>
          </Paper>
        )}
      </Stack>
    </main>
  );
}
