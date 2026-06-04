'use client';

import { useMemo, useState } from 'react';
import type { Activity, Project } from '@gen-task/shared';
import {
  activitySubTab,
  buildStatusMap,
  getActivityFieldValue,
  type ActivitySubTab,
} from '../components/activities/activities.helpers';

export type SortDir = 'asc' | 'desc';

/**
 * Filtrado, ordenamiento y paginacion de actividades del lado del cliente.
 * Port de `useTicketsFilter` de Motorola adaptado al modelo de GEN-Task:
 * sub-pestanas por estado (activos/finalizados/archivados), orden por columna,
 * filtros por valor de columna, filtro por rango de fecha de creacion y
 * paginacion.
 */
export function useActivitiesFilter(activities: Activity[], project: Project) {
  const statusMap = useMemo(() => buildStatusMap(project), [project]);

  const [subTab, setSubTab] = useState<ActivitySubTab>('activos');
  const [sortCol, setSortCol] = useState<string>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterFields, setFilterFieldsState] = useState<Record<string, string[]>>({});
  const [filterResponsibles, setFilterResponsibles] = useState<string[]>([]);
  const [filterFechaFrom, setFilterFechaFrom] = useState('');
  const [filterFechaTo, setFilterFechaTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');

  // Predicado comun (campos, responsables, rango de fecha) sin el filtro de
  // sub-pestana, para reutilizarlo en la tabla y el tablero.
  const matchesCommonFilters = useMemo(() => {
    return (a: Activity) => {
      for (const [key, vals] of Object.entries(filterFields)) {
        if (vals.length && !vals.includes(getActivityFieldValue(a, project, key))) return false;
      }
      if (
        filterResponsibles.length &&
        !a.responsibleIds.some((id) => filterResponsibles.includes(id))
      ) {
        return false;
      }
      if (filterFechaFrom) {
        const from = new Date(filterFechaFrom).getTime();
        if (new Date(a.createdAt).getTime() < from) return false;
      }
      if (filterFechaTo) {
        const to = new Date(filterFechaTo + 'T23:59:59').getTime();
        if (new Date(a.createdAt).getTime() > to) return false;
      }
      return true;
    };
  }, [filterFields, filterResponsibles, filterFechaFrom, filterFechaTo, project]);

  const filtered = useMemo(() => {
    return activities.filter(
      (a) => activitySubTab(a, statusMap) === subTab && matchesCommonFilters(a),
    );
  }, [activities, statusMap, subTab, matchesCommonFilters]);

  // Para el tablero (kanban): todas las actividades no archivadas, sin importar
  // la sub-pestana, ya que cada columna representa un estado del proyecto.
  const boardFiltered = useMemo(() => {
    return activities.filter((a) => !a.isArchived && matchesCommonFilters(a));
  }, [activities, matchesCommonFilters]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aVal = getActivityFieldValue(a, project, sortCol);
      const bVal = getActivityFieldValue(b, project, sortCol);
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortCol, sortDir, project]);

  const pageSizeNum = parseInt(pageSize, 10);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSizeNum));
  const paginated = sorted.slice((page - 1) * pageSizeNum, page * pageSizeNum);
  const startIdx = sorted.length === 0 ? 0 : (page - 1) * pageSizeNum + 1;
  const endIdx = Math.min(page * pageSizeNum, sorted.length);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortCol(col);
      setSortDir('asc');
    }
    setPage(1);
  };

  const setFieldFilter = (key: string, vals: string[]) => {
    setFilterFieldsState((prev) => ({ ...prev, [key]: vals }));
    setPage(1);
  };

  const setResponsibleFilter = (ids: string[]) => {
    setFilterResponsibles(ids);
    setPage(1);
  };

  return {
    statusMap,
    subTab,
    setSubTab,
    sortCol,
    sortDir,
    handleSort,
    filterFields,
    setFieldFilter,
    filterResponsibles,
    setResponsibleFilter,
    filterFechaFrom,
    setFilterFechaFrom,
    filterFechaTo,
    setFilterFechaTo,
    page,
    setPage,
    pageSize,
    setPageSize,
    filtered,
    boardFiltered,
    sorted,
    paginated,
    totalPages,
    startIdx,
    endIdx,
  };
}
