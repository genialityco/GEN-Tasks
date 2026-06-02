import { IsBooleanString, IsOptional, IsString } from 'class-validator';

/** Filtros basicos para el listado de actividades (la vista tabla amplia esto). */
export class QueryActivitiesDto {
  @IsOptional()
  @IsString()
  statusId?: string;

  @IsOptional()
  @IsString()
  responsibleId?: string;

  /** Busqueda por nombre (prefijo). */
  @IsOptional()
  @IsString()
  search?: string;

  /** 'true' para incluir archivadas. Por defecto se excluyen. */
  @IsOptional()
  @IsBooleanString()
  includeArchived?: string;
}
