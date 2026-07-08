import { IsArray } from 'class-validator';

/**
 * Importacion masiva de contactos. El frontend parsea el Excel y envia las filas
 * como objetos `columna -> valor` (clave = encabezado). El backend mapea cada
 * columna al campo de contacto correspondiente por su label.
 */
export class ImportContactsDto {
  @IsArray()
  rows!: Array<Record<string, string>>;
}
