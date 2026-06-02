import {
  Body,
  Controller,
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
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateFeaturesDto } from './dto/update-features.dto';

@Controller('organizations')
@UseGuards(RolesGuard, OrganizationAccessGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

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
