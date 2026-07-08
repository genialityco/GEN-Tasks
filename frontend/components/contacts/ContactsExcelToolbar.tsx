'use client';

import { useRef, useState } from 'react';
import {
  Button,
  Group,
  Modal,
  Stack,
  Text,
  Alert,
  List,
  Loader,
  Paper,
} from '@mantine/core';
import { IconFileImport, IconFileDownload } from '@tabler/icons-react';
import * as XLSX from 'xlsx';
import { contactsApi, type ContactImportResult } from '../../services/api/contacts.api';

/**
 * Importa contactos desde Excel y permite descargar la plantilla con las
 * columnas correctas (una por cada campo definido + "Proyectos"). El parseo y la
 * generacion del .xlsx ocurren en el navegador; el backend recibe/valida filas.
 */
export function ContactsExcelToolbar({
  organizationId,
  onImported,
}: {
  organizationId: string;
  onImported: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'import' | 'template' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ContactImportResult | null>(null);

  async function handleTemplate() {
    setBusy('template');
    setError(null);
    try {
      const { columns } = await contactsApi.template(organizationId);
      if (columns.length === 0) {
        setError('Primero define los campos del contacto.');
        return;
      }
      // Hoja con solo los encabezados (fila de ejemplo vacía).
      const sheet = XLSX.utils.aoa_to_sheet([columns]);
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, 'Contactos');
      XLSX.writeFile(book, 'plantilla_contactos.xlsx');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleFile(file: File) {
    setBusy('import');
    setError(null);
    setResult(null);
    try {
      const buffer = await file.arrayBuffer();
      const book = XLSX.read(buffer, { type: 'array' });
      const sheet = book.Sheets[book.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
        defval: '',
        raw: false,
      });
      if (rows.length === 0) {
        setError('El archivo no contiene filas de datos.');
        return;
      }
      const res = await contactsApi.import(organizationId, rows);
      setResult(res);
      if (res.created.length > 0) onImported();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Text fw={700}>Importar contactos</Text>
        <Text size="sm" c="dimmed">
          Descarga la plantilla, llena los datos y súbela para cargar contactos de
          forma masiva. La columna “Proyectos” admite varios nombres separados por
          coma.
        </Text>

        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <Group gap="xs">
          <Button
            variant="light"
            leftSection={<IconFileDownload size={16} />}
            loading={busy === 'template'}
            onClick={handleTemplate}
          >
            Descargar plantilla
          </Button>
          <Button
            leftSection={<IconFileImport size={16} />}
            loading={busy === 'import'}
            onClick={() => fileInput.current?.click()}
          >
            Importar Excel
          </Button>
        </Group>

        {error && (
          <Alert color="red" onClose={() => setError(null)} withCloseButton>
            {error}
          </Alert>
        )}
      </Stack>

      <Modal
        opened={result !== null}
        onClose={() => setResult(null)}
        title="Resultado de la importación"
        centered
      >
        {busy === 'import' && <Loader />}
        {result && (
          <Stack gap="sm">
            <Text c="green" fw={600}>
              {result.created.length} contacto(s) importado(s).
            </Text>
            {result.failed.length > 0 && (
              <>
                <Text c="red" fw={600}>
                  {result.failed.length} fila(s) con error:
                </Text>
                <List size="sm">
                  {result.failed.map((f) => (
                    <List.Item key={f.row}>
                      Fila {f.row}: {f.reason}
                    </List.Item>
                  ))}
                </List>
              </>
            )}
            <Group justify="flex-end">
              <Button onClick={() => setResult(null)}>Cerrar</Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Paper>
  );
}
