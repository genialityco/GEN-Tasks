import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * Modulo global de almacenamiento. Expuesto globalmente para que cualquier
 * dominio (actividades, whatsapp) pueda subir archivos sin reimportarlo.
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
