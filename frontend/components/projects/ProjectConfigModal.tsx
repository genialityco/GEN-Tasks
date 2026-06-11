'use client';

import { Modal, Loader, Alert } from '@mantine/core';
import { useProject } from '../../hooks/useProjects';
import { ProjectConfig } from './ProjectConfig';

/**
 * Modal con la configuracion completa de un proyecto. Carga el detalle del
 * proyecto (estados, campos personalizados, reglas) al abrirse desde el sidebar.
 */
export function ProjectConfigModal({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const { data: project, loading, error, reload } = useProject(projectId);

  // Recarga el detalle del modal y notifica a la pagina del proyecto abierta
  // (si corresponde) para que refleje los cambios al instante.
  function handleChanged() {
    reload();
    window.dispatchEvent(
      new CustomEvent('gt:project-changed', { detail: projectId }),
    );
  }

  return (
    <Modal
      opened
      onClose={onClose}
      title={`Configuración del Proyecto${project ? ` · ${project.name}` : ''}`}
      size="xl"
      centered
    >
      {loading && <Loader color="blue" type="bars" />}
      {error && <Alert color="red">{error}</Alert>}
      {project && <ProjectConfig project={project} onChanged={handleChanged} />}
    </Modal>
  );
}
