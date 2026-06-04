'use client';

import { Paper, Stack, Divider, Text } from '@mantine/core';
import type { Project } from '@gen-task/shared';
import { StatusFlowConfig } from './StatusFlowConfig';
import { RulesManager } from '../rules/RulesManager';

/**
 * Pantalla unica de reglas del proyecto. Reune en un solo lugar las dos clases de
 * regla, que comparten el mismo editor de condiciones (`ConditionBuilder`) pero
 * tienen proposito distinto:
 *  - Restricciones (bloqueos): impiden un cambio de estado si no se cumple un
 *    requisito. Se evaluan ANTES del cambio.
 *  - Automatizaciones (triggers): ejecutan una accion cuando ocurre un evento y
 *    se cumple una condicion. Se evaluan DESPUES del evento.
 */
export function ProjectRulesConfig({
  project,
  onChanged,
}: {
  project: Project;
  onChanged: () => void;
}) {
  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="md">
        <div>
          <Text fw={700}>Reglas del proyecto</Text>
          <Text size="xs" c="dimmed">
            Las <strong>restricciones</strong> bloquean un cambio de estado cuando no se
            cumple un requisito (se evalúan antes del cambio). Las{' '}
            <strong>automatizaciones</strong> ejecutan una acción cuando ocurre un evento y
            se cumple una condición (se evalúan después). Ambas usan el mismo editor de
            condiciones.
          </Text>
        </div>

        <Divider
          label="Restricciones · bloqueos de cambio de estado"
          labelPosition="left"
        />
        <StatusFlowConfig project={project} onChanged={onChanged} />

        <Divider label="Automatizaciones · triggers" labelPosition="left" />
        <RulesManager
          projectId={project.id}
          organizationId={project.organizationId}
          fields={project.customFields}
          statuses={project.statuses}
        />
      </Stack>
    </Paper>
  );
}
