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
 * Filtro de una columna de fecha personalizada (ej: "Fecha del evento"):
 * rango desde/hasta (YYYY-MM-DD).
 */
export interface DateFieldFilter {
  from: string;
  to: string;
}

/**
 * Alcance de la lista: solo la sub-pestana actual ("activos") o activas y
 * finalizadas juntas ("todos").
 */
export type ActivityScope = 'activos' | 'todos';

export const EMPTY_DATE_FIELD_FILTER: DateFieldFilter = { from: '', to: '' };

export function isDateFieldFilterActive(f?: DateFieldFilter): boolean {
  return !!f && (!!f.from || !!f.to);
}

/** Normaliza un valor de fecha a `YYYY-MM-DD` (fecha local), o '' si no es valido. */
function toDateKey(v: unknown): string {
  if (v == null || v === '') return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

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
  const [dateFieldFilters, setDateFieldFilters] = useState<Record<string, DateFieldFilter>>({});
  const [scope, setScopeState] = useState<ActivityScope>('activos');
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
      // Columnas de fecha personalizadas (`cf_<key>`): rango desde/hasta.
      for (const [key, f] of Object.entries(dateFieldFilters)) {
        if (!isDateFieldFilterActive(f)) continue;
        const v = toDateKey(a.customFieldValues?.[key.slice(3)]);
        if (!v) return false;
        if (f.from && v < f.from) return false;
        if (f.to && v > f.to) return false;
      }
      return true;
    };
  }, [filterFields, filterResponsibles, filterFechaFrom, filterFechaTo, dateFieldFilters, project]);

  const filtered = useMemo(() => {
    return activities.filter((a) => {
      const tab = activitySubTab(a, statusMap);
      // "Todos": activas y finalizadas juntas (las archivadas siguen aparte).
      const inScope =
        scope === 'todos' && subTab !== 'archivados'
          ? tab !== 'archivados'
          : tab === subTab;
      return inScope && matchesCommonFilters(a);
    });
  }, [activities, statusMap, subTab, scope, matchesCommonFilters]);

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

  const setDateFieldFilter = (key: string, patch: Partial<DateFieldFilter>) => {
    setDateFieldFilters((prev) => ({
      ...prev,
      [key]: { ...EMPTY_DATE_FIELD_FILTER, ...prev[key], ...patch },
    }));
    setPage(1);
  };

  const setScope = (next: ActivityScope) => {
    setScopeState(next);
    setPage(1);
  };

  const clearDateFieldFilter = (key: string) => {
    setDateFieldFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
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
    dateFieldFilters,
    setDateFieldFilter,
    clearDateFieldFilter,
    scope,
    setScope,
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
