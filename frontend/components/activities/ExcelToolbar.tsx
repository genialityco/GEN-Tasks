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
} from '@mantine/core';
import { IconFileImport, IconFileExport } from '@tabler/icons-react';
import * as XLSX from 'xlsx';
import type { ActivityFilters } from '../../services/api/activities.api';
import { activitiesApi } from '../../services/api/activities.api';

interface ImportResult {
  created: Array<{ row: number; name: string; id: string }>;
  failed: Array<{ row: number; reason: string }>;
}

/**
 * Barra de importacion/exportacion de actividades en Excel (equivalente al
 * import/export de Motorola). El parseo y la generacion del .xlsx ocurren en el
 * navegador (libreria `xlsx`); el backend recibe/devuelve filas en JSON.
 */
export function ExcelToolbar({
  projectId,
  projectName,
  filters,
  onImported,
}: {
  projectId: string;
  projectName: string;
  filters?: ActivityFilters;
  onImported: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'import' | 'export' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleExport() {
    setBusy('export');
    setError(null);
    try {
      const { columns, rows } = await activitiesApi.exportActivities(projectId, filters);
      const sheet = XLSX.utils.json_to_sheet(rows, { header: columns });
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, 'Actividades');
      const safeName = projectName.replace(/[^\w-]+/g, '_').slice(0, 40) || 'proyecto';
      const date = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(book, `actividades_${safeName}_${date}.xlsx`);
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
      // `defval: ''` asegura que toda columna del encabezado este presente aunque
      // la celda este vacia, para que el backend pueda mapearla.
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
        defval: '',
        raw: false,
      });
      if (rows.length === 0) {
        setError('El archivo no contiene filas de datos.');
        return;
      }
      const res = await activitiesApi.importActivities(projectId, rows);
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
    <>
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
          leftSection={<IconFileImport size={16} />}
          loading={busy === 'import'}
          onClick={() => fileInput.current?.click()}
        >
          Importar Excel
        </Button>
        <Button
          variant="light"
          leftSection={<IconFileExport size={16} />}
          loading={busy === 'export'}
          onClick={handleExport}
        >
          Exportar Excel
        </Button>
      </Group>

      {error && (
        <Alert color="red" mt="sm" onClose={() => setError(null)} withCloseButton>
          {error}
        </Alert>
      )}

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
              {result.created.length} actividad(es) creada(s).
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
    </>
  );
}
