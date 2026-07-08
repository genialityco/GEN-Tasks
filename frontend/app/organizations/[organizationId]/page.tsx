'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Paper, Title, Button, Stack, Group, Text, Loader } from '@mantine/core';
import { UserRole } from '@gen-task/shared';
import { useAuth } from '../../../services/auth/AuthProvider';
import { isSuperAdmin, roleInOrganization } from '../../../services/auth/roles';
import { useOrganization } from '../../../hooks/useOrganizations';
import { useProjects } from '../../../hooks/useProjects';
import { CreateProjectForm } from '../../../components/projects/CreateProjectForm';
import { OrganizationFeaturesPanel } from '../../../components/organizations/OrganizationFeaturesPanel';
import { AssignAdminPanel } from '../../../components/organizations/AssignAdminPanel';
import { ContactsSection } from '../../../components/contacts/ContactsSection';

/** Vista inicial de la organizacion: proyectos + administracion (segun rol). */
export default function OrganizationHomePage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const { profile } = useAuth();
  const role = roleInOrganization(profile, organizationId);
  const isAdmin = role === UserRole.ADMIN || isSuperAdmin(profile);

  const { data: organization, reload: reloadOrg } = useOrganization(organizationId);
  const { data: projects, loading, reload: reloadProjects } = useProjects(organizationId);
  const [creating, setCreating] = useState(false);

  return (
    <main style={{ padding: 24 }}>
      <Stack gap="lg" maw={900}>
        <Title order={2}>{organization?.name ?? 'Organización'}</Title>

        {/* Proyectos */}
        <Stack gap="sm">
          <Group justify="space-between">
            <Title order={4}>Proyectos</Title>
            {isAdmin && !creating && (
              <Button onClick={() => setCreating(true)}>Crear proyecto</Button>
            )}
          </Group>

          {creating && (
            <CreateProjectForm
              organizationId={organizationId}
              onCancel={() => setCreating(false)}
              onCreated={() => {
                setCreating(false);
                reloadProjects();
              }}
            />
          )}

          {loading && <Loader color="blue" type="bars" />}
          <Stack gap="xs">
            {projects?.map((p) => (
              <Paper
                key={p.id}
                component={Link}
                href={`/organizations/${organizationId}/projects/${p.id}`}
                p="md"
                withBorder
                radius="md"
                style={{ color: 'inherit', display: 'block' }}
              >
                <Text fw={700}>{p.name}</Text>
                {p.description && <Text size="sm" c="dimmed">{p.description}</Text>}
              </Paper>
            ))}
            {projects && projects.length === 0 && !creating && (
              <Text c="dimmed">Esta organización aún no tiene proyectos.</Text>
            )}
          </Stack>
        </Stack>

        {/* Contactos (ADMIN de la organizacion y SUPER_ADMIN, si esta habilitado) */}
        {isAdmin && organization?.enabledFeatures.contactsEnabled && (
          <ContactsSection organizationId={organizationId} />
        )}

        {/* Administracion (solo SUPER_ADMIN) */}
        {isSuperAdmin(profile) && organization && (
          <Stack gap="sm">
            <Title order={4}>Administración</Title>
            <AssignAdminPanel organization={organization} onChanged={reloadOrg} />
            <OrganizationFeaturesPanel organization={organization} onUpdated={reloadOrg} />
          </Stack>
        )}
      </Stack>
    </main>
  );
}
