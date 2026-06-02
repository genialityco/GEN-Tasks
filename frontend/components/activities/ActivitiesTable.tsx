'use client';

import { useMemo, useState } from 'react';
import type { Activity, Project } from '@gen-task/shared';

interface Column {
  key: string;
  label: string;
  render: (activity: Activity) => string;
}

/**
 * Tabla configurable de actividades. Renderiza columnas base + columnas de
 * campos personalizados del proyecto, con visibilidad de columnas conmutable.
 * Pensada para crecer (reordenar, filtros avanzados, vistas Kanban/calendario).
 */
export function ActivitiesTable({
  project,
  activities,
}: {
  project: Project;
  activities: Activity[];
}) {
  const statusName = (id: string) =>
    project.statuses.find((s) => s.id === id)?.name ?? id;

  const columns = useMemo<Column[]>(() => {
    const base: Column[] = [
      { key: 'name', label: 'Nombre', render: (a) => a.name },
      { key: 'status', label: 'Estado', render: (a) => statusName(a.statusId) },
      {
        key: 'responsibles',
        label: 'Responsable',
        render: (a) => a.responsibleIds.join(', ') || '-',
      },
      {
        key: 'createdAt',
        label: 'Creacion',
        render: (a) => new Date(a.createdAt).toLocaleDateString(),
      },
      {
        key: 'scheduledDate',
        label: 'Programacion',
        render: (a) =>
          a.scheduledDate
            ? new Date(a.scheduledDate).toLocaleDateString()
            : '-',
      },
    ];
    const custom: Column[] = project.customFields
      .filter((f) => f.isActive && !f.isArchived)
      .map((f) => ({
        key: `cf_${f.key}`,
        label: f.label,
        render: (a) => {
          const v = a.customFieldValues?.[f.key];
          return v == null ? '-' : String(v);
        },
      }));
    return [...base, ...custom];
  }, [project]);

  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visibleColumns = columns.filter((c) => !hidden.has(c.key));

  function toggleColumn(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <details className="gt-card">
        <summary style={{ cursor: 'pointer' }}>Columnas</summary>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
          {columns.map((c) => (
            <label key={c.key} style={{ display: 'flex', gap: 4 }}>
              <input
                type="checkbox"
                checked={!hidden.has(c.key)}
                onChange={() => toggleColumn(c.key)}
              />
              {c.label}
            </label>
          ))}
        </div>
      </details>

      <div className="gt-card" style={{ overflowX: 'auto', padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {visibleColumns.map((c) => (
                <th
                  key={c.key}
                  style={{
                    textAlign: 'left',
                    padding: 10,
                    borderBottom: '1px solid var(--border)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activities.map((a) => (
              <tr key={a.id}>
                {visibleColumns.map((c) => (
                  <td
                    key={c.key}
                    style={{
                      padding: 10,
                      borderBottom: '1px solid var(--border)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.render(a)}
                  </td>
                ))}
              </tr>
            ))}
            {activities.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length} style={{ padding: 16 }}>
                  <span className="gt-muted">No hay actividades.</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
