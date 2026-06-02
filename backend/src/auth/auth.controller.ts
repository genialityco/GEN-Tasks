import { Controller, Get } from '@nestjs/common';
import { AuthenticatedUser } from '@gen-task/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Endpoints de sesion. La autenticacion real la hace Firebase Auth en el
 * frontend; aqui solo se expone el contexto resuelto del usuario.
 */
@Controller('auth')
export class AuthController {
  /** Devuelve el usuario autenticado con sus membresias (para bootstrap del frontend). */
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
