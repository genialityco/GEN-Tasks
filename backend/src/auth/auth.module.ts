import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';

/**
 * Modulo de autenticacion. El FirebaseAuthGuard se registra de forma global
 * en AppModule; este modulo solo expone endpoints de sesion.
 */
@Module({
  controllers: [AuthController],
})
export class AuthModule {}
