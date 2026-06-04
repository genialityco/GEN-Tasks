'use client';

import { useState } from 'react';
import type { Organization } from '@gen-task/shared';
import { organizationsApi } from '../../services/api/organizations.api';

/**
 * Formulario de creacion de organizacion (solo SUPER_ADMIN). Al crear, llama a
 * `onCreated` para que el contenedor recargue la lista. Los admins se asignan
 * despues desde la organizacion (membresias).
 */
export function CreateOrganizationForm({
  onCreated,
  onCancel,
}: {
  onCreated: (org: Organization) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const org = await organizationsApi.create({ name: name.trim() });
      onCreated(org);
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
      style={{ display: 'grid', gap: 12, maxWidth: 420 }}
    >
      <strong>Nueva organizacion</strong>
      <label style={{ display: 'grid', gap: 4 }}>
        <span>Nombre</span>
        <input
          className="gt-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Lenovo Experiences"
          autoFocus
          required
          minLength={2}
        />
      </label>

      {error && <div className="gt-error">{error}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="gt-btn" type="submit" disabled={submitting}>
          {submitting ? 'Creando...' : 'Crear'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="gt-btn"
          style={{ background: 'var(--border)', color: 'var(--text)' }}
          disabled={submitting}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
