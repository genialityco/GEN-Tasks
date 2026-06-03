import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser, UserRole } from '@gen-task/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { OrganizationAccessGuard } from '../common/guards/organization-access.guard';
import { OrganizationsService } from './organizations.service';
import { UsersService } from '../users/users.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateFeaturesDto } from './dto/update-features.dto';
import { AssignAdminDto } from './dto/assign-admin.dto';

@Controller('organizations')
@UseGuards(RolesGuard, OrganizationAccessGuard)
export class OrganizationsController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly users: UsersService,
  ) {}

  /** Lista organizaciones visibles para el usuario (todas si es SUPER_ADMIN). */
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.organizations.findAll(user);
  }

  /** Solo SUPER_ADMIN crea organizaciones. */
  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  create(
    @Body() dto: CreateOrganizationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizations.create(dto, user);
  }

  @Get(':organizationId')
  findOne(@Param('organizationId') id: string) {
    return this.organizations.findOne(id);
  }

  /**
   * Miembros (admins y gestores) de la organizacion. Lectura disponible para
   * cualquier miembro (incl. GESTOR) para mostrar responsables; la asignacion en
   * si sigue restringida a ADMIN/SUPER_ADMIN en el frontend.
   */
  @Get(':organizationId/members')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.GESTOR)
  listMembers(@Param('organizationId') id: string) {
    return this.users.listOrganizationMembers(id);
  }

  @Patch(':organizationId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  update(
    @Param('organizationId') id: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizations.update(id, dto, user);
  }

  @Patch(':organizationId/archive')
  @Roles(UserRole.SUPER_ADMIN)
  archive(
    @Param('organizationId') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizations.archive(id, user);
  }

  /** Asigna un administrador (crea el usuario si no existe). Exclusivo de SUPER_ADMIN. */
  @Post(':organizationId/admins')
  @Roles(UserRole.SUPER_ADMIN)
  assignAdmin(
    @Param('organizationId') id: string,
    @Body() dto: AssignAdminDto,
  ) {
    return this.organizations.assignAdmin(id, dto);
  }

  /** Quita un administrador de la organizacion. Exclusivo de SUPER_ADMIN. */
  @Delete(':organizationId/admins/:userId')
  @Roles(UserRole.SUPER_ADMIN)
  removeAdmin(
    @Param('organizationId') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizations.removeAdmin(id, userId, user);
  }

  /** Activar/desactivar funcionalidades por organizacion: exclusivo de SUPER_ADMIN. */
  @Patch(':organizationId/features')
  @Roles(UserRole.SUPER_ADMIN)
  updateFeatures(
    @Param('organizationId') id: string,
    @Body() dto: UpdateFeaturesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizations.updateFeatures(id, dto.features, user);
  }
}
