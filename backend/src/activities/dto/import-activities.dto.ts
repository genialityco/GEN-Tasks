import { IsArray } from 'class-validator';

/**
 * Importacion masiva de actividades. El frontend parsea el archivo Excel y envia
 * las filas ya convertidas a objetos `columna -> valor` (clave = encabezado de la
 * columna). El backend mapea cada columna al campo correspondiente por su label.
 */
export class ImportActivitiesDto {
  @IsArray()
  rows!: Array<Record<string, string>>;
}
