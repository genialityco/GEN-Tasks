'use client';

import { useMemo } from 'react';
import { Paper, Stack, Group, Text, Table, Alert, Loader } from '@mantine/core';
import { useProjectContacts, useContactFields } from '../../hooks/useContacts';
import { contactValueText } from './contact.helpers';

/**
 * Contactos asociados a un proyecto: los referenciados por alguna actividad del
 * proyecto (via `Activity.contactIds`). Vista de solo lectura.
 */
export function ProjectContactsPanel({
  organizationId,
  projectId,
}: {
  organizationId: string;
  projectId: string;
}) {
  const { data: contacts, loading, error } = useProjectContacts(projectId);
  const { data: fields } = useContactFields(organizationId);

  const activeFields = useMemo(
    () =>
      (fields ?? [])
        .filter((f) => !f.isArchived && f.isActive)
        .sort((a, b) => a.order - b.order),
    [fields],
  );

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={700}>Contactos del proyecto</Text>
          {contacts && (
            <Text size="sm" c="dimmed">
              {contacts.length} contacto{contacts.length !== 1 ? 's' : ''}
            </Text>
          )}
        </Group>
        <Text size="sm" c="dimmed">
          Son los contactos relacionados con las actividades de este proyecto.
        </Text>

        {error && <Alert color="red">{error}</Alert>}
        {loading && <Loader size="sm" />}

        {!loading && contacts && contacts.length > 0 && (
          <Table.ScrollContainer minWidth={400}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  {activeFields.map((f) => (
                    <Table.Th key={f.id}>{f.label}</Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {contacts.map((c) => (
                  <Table.Tr key={c.id}>
                    {activeFields.map((f) => (
                      <Table.Td key={f.id}>
                        {contactValueText(f, c.values?.[f.key]) || '—'}
                      </Table.Td>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}

        {!loading && contacts && contacts.length === 0 && (
          <Text c="dimmed" size="sm">
            Ninguna actividad de este proyecto tiene contactos asociados todavía.
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
