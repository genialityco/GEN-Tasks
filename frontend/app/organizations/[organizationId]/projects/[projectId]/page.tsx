'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import type { UserRole } from '@gen-task/shared';
import { useAuth } from '../../../../../services/auth/AuthProvider';
import {
  canViewProjectTab,
  roleInOrganization,
} from '../../../../../services/auth/roles';
import { useProject } from '../../../../../hooks/useProjects';
import { useActivities } from '../../../../../hooks/useActivities';
import { ActivitiesTable } from '../../../../../components/activities/ActivitiesTable';

type Tab = 'activities' | 'host' | 'gestores' | 'config';

const TABS: { key: Tab; label: string }[] = [
  { key: 'activities', label: 'Actividades' },
  { key: 'host', label: 'Host' },
  { key: 'gestores', label: 'Gestores' },
  { key: 'config', label: 'Configuracion del Proyecto' },
];

/** Vista de un proyecto con navbar interno por rol. */
export default function ProjectPage() {
  const params = useParams<{ organizationId: string; projectId: string }>();
  const { profile } = useAuth();
  const role = roleInOrganization(profile, params.organizationId);
  const [tab, setTab] = useState<Tab>('activities');

  const { data: project, loading, error } = useProject(params.projectId);

  const visibleTabs = TABS.filter((t) => canViewProjectTab(role, t.key));

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>{project?.name ?? 'Proyecto'}</h1>

      <nav style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)' }}>
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom:
                tab === t.key
                  ? '2px solid var(--primary)'
                  : '2px solid transparent',
              padding: '8px 12px',
              color: tab === t.key ? 'var(--primary)' : 'var(--text)',
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {loading && <p>Cargando proyecto...</p>}
      {error && <p className="gt-error">{error}</p>}

      {project && tab === 'activities' && (
        <ActivitiesTab projectId={project.id} role={role} project={project} />
      )}
      {tab === 'host' && <Placeholder text="Host (Fase 7): gestion de hosts." />}
      {tab === 'gestores' && (
        <Placeholder text="Gestores (Fase 5): permisos y restricciones." />
      )}
      {tab === 'config' && (
        <Placeholder text="Configuracion (Fase 3/6): estados, campos, reglas." />
      )}
    </main>
  );
}

function ActivitiesTab({
  projectId,
  role,
  project,
}: {
  projectId: string;
  role: UserRole | null;
  project: NonNullable<ReturnType<typeof useProject>['data']>;
}) {
  const { data: activities, loading, error } = useActivities(projectId);
  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div className="gt-muted">Rol en esta organizacion: {role ?? '-'}</div>
      {loading && <p>Cargando actividades...</p>}
      {error && <p className="gt-error">{error}</p>}
      {activities && (
        <ActivitiesTable project={project} activities={activities} />
      )}
    </section>
  );
}

function Placeholder({ text }: { text: string }) {
  return <div className="gt-card gt-muted">{text}</div>;
}
