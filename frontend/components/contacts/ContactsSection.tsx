'use client';

import { Tabs, Stack, Title, Loader, Alert } from '@mantine/core';
import { IconAddressBook, IconForms, IconFileImport } from '@tabler/icons-react';
import { useContactFields } from '../../hooks/useContacts';
import { ContactsPanel } from './ContactsPanel';
import { ContactFieldsManager } from './ContactFieldsManager';
import { ContactsExcelToolbar } from './ContactsExcelToolbar';

/**
 * Seccion de Contactos de la organizacion: contactos, definicion de campos e
 * importacion por Excel. Disponible para ADMIN de la organizacion y SUPER_ADMIN
 * cuando la funcionalidad `contactsEnabled` esta activa.
 */
export function ContactsSection({ organizationId }: { organizationId: string }) {
  const { data: fields, loading, error, reload } = useContactFields(organizationId);

  return (
    <Stack gap="sm">
      <Title order={4}>Contactos</Title>
      {error && <Alert color="red">{error}</Alert>}
      {loading && !fields && <Loader size="sm" />}

      <Tabs defaultValue="contacts">
        <Tabs.List>
          <Tabs.Tab value="contacts" leftSection={<IconAddressBook size={16} />}>
            Contactos
          </Tabs.Tab>
          <Tabs.Tab value="fields" leftSection={<IconForms size={16} />}>
            Campos
          </Tabs.Tab>
          <Tabs.Tab value="import" leftSection={<IconFileImport size={16} />}>
            Importar
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="contacts" pt="sm">
          <ContactsPanel organizationId={organizationId} fields={fields ?? []} />
        </Tabs.Panel>
        <Tabs.Panel value="fields" pt="sm">
          <ContactFieldsManager
            organizationId={organizationId}
            fields={fields ?? []}
            onChanged={reload}
          />
        </Tabs.Panel>
        <Tabs.Panel value="import" pt="sm">
          <ContactsExcelToolbar
            organizationId={organizationId}
            onImported={() => reload()}
          />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
