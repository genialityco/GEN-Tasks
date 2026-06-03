'use client';

import { hostsApi } from '../../services/api/hosts.api';
import { useAsync } from '../../hooks/useAsync';

/**
 * Lista de Hosts de la organizacion. Los hosts solo existen via WhatsApp; se
 * crean automaticamente al recibir mensajes. Aqui se consultan.
 */
export function HostsPanel({ organizationId }: { organizationId: string }) {
  const { data: hosts, loading, error } = useAsync(
    () => hostsApi.listByOrg(organizationId),
    [organizationId],
  );

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>Hosts</h2>
      <p className="gt-muted" style={{ margin: 0 }}>
        Los hosts se registran automaticamente cuando escriben por WhatsApp.
      </p>
      {loading && <p>Cargando...</p>}
      {error && <p className="gt-error">{error}</p>}
      <div className="gt-card" style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid var(--border)' }}>
                Telefono
              </th>
              <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid var(--border)' }}>
                Nombre
              </th>
              <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid var(--border)' }}>
                Registrado
              </th>
            </tr>
          </thead>
          <tbody>
            {hosts?.map((h) => (
              <tr key={h.id}>
                <td style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>{h.phone}</td>
                <td style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
                  {h.name ?? '-'}
                </td>
                <td style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
                  {new Date(h.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {hosts && hosts.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: 16 }}>
                  <span className="gt-muted">Sin hosts registrados.</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
