'use client';

import { useState } from 'react';
import type { Project } from '@gen-task/shared';
import { projectsApi } from '../../services/api/projects.api';

/**
 * Crea un proyecto dentro de una organizacion. El backend genera los estados
 * por defecto (Para Hacer / En Proceso / Finalizado) automaticamente.
 */
export function CreateProjectForm({
  organizationId,
  onCreated,
  onCancel,
}: {
  organizationId: string;
  onCreated: (project: Project) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const project = await projectsApi.create(organizationId, {
        name: name.trim(),
        description: description.trim() || undefined,
      });
      onCreated(project);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="gt-card"
      style={{ display: 'grid', gap: 12, maxWidth: 460 }}
    >
      <strong>Nuevo proyecto</strong>
      <label style={{ display: 'grid', gap: 4 }}>
        <span>Nombre</span>
        <input
          className="gt-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
          minLength={2}
        />
      </label>
      <label style={{ display: 'grid', gap: 4 }}>
        <span>Descripcion (opcional)</span>
        <input
          className="gt-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      {error && <div className="gt-error">{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="gt-btn" type="submit" disabled={submitting}>
          {submitting ? 'Creando...' : 'Crear proyecto'}
        </button>
        <button
          type="button"
          className="gt-btn"
          style={{ background: 'var(--border)', color: 'var(--text)' }}
          onClick={onCancel}
          disabled={submitting}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
