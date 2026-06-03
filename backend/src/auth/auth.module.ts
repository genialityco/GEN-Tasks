import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';

/**
 * Modulo de autenticacion. El FirebaseAuthGuard se registra de forma global
 * en AppModule; este modulo solo expone endpoints de sesion.
 */
@Module({
  imports: [UsersModule],
  controllers: [AuthController],
})
export class AuthModule {}
