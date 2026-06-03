'use client';

import { useState } from 'react';
import type { Project } from '@gen-task/shared';
import { projectsApi } from '../../services/api/projects.api';
import { StatusesManager } from './StatusesManager';
import { StatusFlowConfig } from './StatusFlowConfig';
import { CustomFieldsManager } from './CustomFieldsManager';
import { ComplianceConfig } from './ComplianceConfig';
import { RulesManager } from '../rules/RulesManager';

/** Configuracion del proyecto: nombre, estados, campos personalizados y reglas. */
export function ProjectConfig({
  project,
  onChanged,
}: {
  project: Project;
  onChanged: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [savingName, setSavingName] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    setError(null);
    try {
      await projectsApi.update(project.id, { name: name.trim() });
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingName(false);
    }
  }

  async function archiveProject() {
    if (!confirm(`Archivar el proyecto "${project.name}"?`)) return;
    await projectsApi.archive(project.id);
    onChanged();
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="gt-card" style={{ display: 'grid', gap: 8 }}>
        <strong>Datos del proyecto</strong>
        {error && <div className="gt-error">{error}</div>}
        <form onSubmit={saveName} style={{ display: 'flex', gap: 8 }}>
          <input
            className="gt-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="gt-btn" type="submit" disabled={savingName}>
            Guardar
          </button>
          <button
            type="button"
            className="gt-btn"
            style={{ background: 'var(--danger)' }}
            onClick={archiveProject}
          >
            Archivar
          </button>
        </form>
      </div>

      <StatusesManager
        projectId={project.id}
        statuses={project.statuses}
        onChanged={onChanged}
      />
      <StatusFlowConfig project={project} onChanged={onChanged} />
      <ComplianceConfig project={project} onChanged={onChanged} />
      <CustomFieldsManager
        projectId={project.id}
        fields={project.customFields}
        onChanged={onChanged}
      />
      <RulesManager
        projectId={project.id}
        fields={project.customFields}
        statuses={project.statuses}
      />
    </div>
  );
}
