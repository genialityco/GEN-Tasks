'use client';

import { useParams } from 'next/navigation';
import { useOrganization } from '../../../hooks/useOrganizations';
import { useProjects } from '../../../hooks/useProjects';

/** Vista inicial de la organizacion: resumen y seleccion de proyecto. */
export default function OrganizationHomePage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const { data: organization } = useOrganization(organizationId);
  const { data: projects, loading } = useProjects(organizationId);

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>{organization?.name ?? 'Organizacion'}</h1>
      <p className="gt-muted" style={{ margin: 0 }}>
        Selecciona un proyecto en el menu lateral para ver sus actividades.
      </p>

      {loading && <p>Cargando proyectos...</p>}
      {projects && projects.length === 0 && (
        <div className="gt-card">
          Esta organizacion aun no tiene proyectos. Un ADMIN puede crearlos
          (Fase 3).
        </div>
      )}
    </main>
  );
}
