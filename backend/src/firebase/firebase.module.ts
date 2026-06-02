import { Global, Module } from '@nestjs/common';
import { FirebaseService } from './firebase.service';

/**
 * Modulo global: expone FirebaseService a toda la aplicacion sin necesidad de
 * reimportarlo en cada modulo de dominio.
 */
@Global()
@Module({
  providers: [FirebaseService],
  exports: [FirebaseService],
})
export class FirebaseModule {}
