'use client';

import { IconArrowUp, IconArrowDown, IconArrowsSort } from '@tabler/icons-react';

interface Props {
  sortCol: string;
  sortDir: 'asc' | 'desc';
  col: string;
}

/** Indicador de orden por columna (port de Motorola). */
export function SortIcon({ sortCol, sortDir, col }: Props) {
  if (sortCol !== col) return <IconArrowsSort size={13} opacity={0.35} />;
  return sortDir === 'asc' ? <IconArrowUp size={13} /> : <IconArrowDown size={13} />;
}
