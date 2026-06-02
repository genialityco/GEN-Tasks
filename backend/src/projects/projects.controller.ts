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
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Controller()
@UseGuards(RolesGuard, OrganizationAccessGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  // Rutas con :organizationId -> el guard valida acceso a la organizacion.
  @Get('organizations/:organizationId/projects')
  findAll(@Param('organizationId') organizationId: string) {
    return this.projects.findAllByOrganization(organizationId);
  }

  @Post('organizations/:organizationId/projects')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  create(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateProjectDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.create(organizationId, dto, user);
  }

  // Rutas con :projectId -> el tenant scoping se valida en el servicio.
  @Get('projects/:projectId')
  findOne(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.findOne(projectId, user);
  }

  @Patch('projects/:projectId')
  update(
    @Param('projectId') projectId: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.update(projectId, dto, user);
  }

  @Patch('projects/:projectId/archive')
  archive(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.archive(projectId, user);
  }
}
