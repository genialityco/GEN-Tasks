'use client';

import { useState } from 'react';
import {
  Paper,
  Stack,
  Group,
  Text,
  Switch,
  NumberInput,
  Button,
  Alert,
} from '@mantine/core';
import {
  DEFAULT_PROJECT_COMPLIANCE,
  type Project,
  type ProjectCompliance,
} from '@gen-task/shared';
import { projectsApi } from '../../services/api/projects.api';

/**
 * Configuracion del semaforo de cumplimiento (deadline) del proyecto. La fecha
 * limite de una actividad es su programacion (fecha exacta) o, si no tiene,
 * `creacion + dias por defecto`. El color se deriva de los dias restantes.
 */
export function ComplianceConfig({
  project,
  onChanged,
}: {
  project: Project;
  onChanged: () => void;
}) {
  const initial = project.compliance ?? DEFAULT_PROJECT_COMPLIANCE;
  const [value, setValue] = useState<ProjectCompliance>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function patch(p: Partial<ProjectCompliance>) {
    setValue((prev) => ({ ...prev, ...p }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await projectsApi.update(project.id, { compliance: value });
      setOk('Semáforo guardado.');
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={700}>Semáforo de cumplimiento</Text>
          <Switch
            checked={value.enabled}
            onChange={(e) => patch({ enabled: e.currentTarget.checked })}
            label={value.enabled ? 'Activado' : 'Desactivado'}
          />
        </Group>
        {error && <Alert color="red">{error}</Alert>}
        {ok && <Alert color="green">{ok}</Alert>}

        <Text size="sm" c="dimmed">
          La fecha límite de una actividad es su programación (fecha exacta). Si no
          tiene, se calcula como creación + días por defecto.
        </Text>

        <Group gap="md" wrap="wrap" align="flex-end">
          <NumberInput
            label="Días por defecto"
            description="Desde la creación"
            value={value.defaultDurationDays ?? ''}
            onChange={(v) =>
              patch({ defaultDurationDays: v === '' ? undefined : Number(v) })
            }
            min={0}
            disabled={!value.enabled}
            w={150}
          />
          <NumberInput
            label="Prioritario (amarillo)"
            description="≤ días restantes"
            value={value.attentionThresholdDays}
            onChange={(v) => patch({ attentionThresholdDays: Number(v) || 0 })}
            min={0}
            disabled={!value.enabled}
            w={170}
          />
          <NumberInput
            label="Por expirar (rojo)"
            description="≤ días restantes"
            value={value.criticalThresholdDays}
            onChange={(v) => patch({ criticalThresholdDays: Number(v) || 0 })}
            min={0}
            disabled={!value.enabled}
            w={160}
          />
        </Group>

        <Button onClick={save} loading={busy} style={{ alignSelf: 'flex-start' }}>
          Guardar semáforo
        </Button>
      </Stack>
    </Paper>
  );
}
