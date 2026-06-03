import { Body, Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { AuthenticatedUser } from '@gen-task/shared';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UsersService } from '../users/users.service';
import { PrivateSuperAdminSignInDto } from './dto/private-super-admin-signin.dto';

/**
 * Endpoints de sesion. La autenticacion real la hace Firebase Auth en el
 * frontend; aqui solo se expone el contexto resuelto del usuario.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  /** Devuelve el usuario autenticado con sus membresias (para bootstrap del frontend). */
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  /**
   * Sign in privado para bootstrap: crea/promueve un SUPER_ADMIN usando una
   * llave interna y devuelve un custom token de Firebase.
   */
  @Public()
  @Post('setup/super-admin/sign-in')
  async privateSuperAdminSignIn(
    @Headers('x-admin-setup-key') setupKey: string | undefined,
    @Body() dto: PrivateSuperAdminSignInDto,
  ) {
    const expected = this.config.get<string>('ADMIN_SETUP_KEY');
    if (!expected || setupKey !== expected) {
      throw new UnauthorizedException('Token de autenticacion invalido.');
    }

    const result = await this.users.createPrivateSuperAdmin({
      email: dto.email,
      name: dto.name,
      password: dto.password,
      isSuperAdmin: true,
    });

    return result;
  }
}
