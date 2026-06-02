import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser } from '@gen-task/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ProjectsService } from '../projects/projects.service';
import {
  CreateStatusDto,
  UpdateStatusDto,
} from '../projects/dto/project-status.dto';
import { RolesGuard } from '../common/guards/roles.guard';

/**
 * Estados del proyecto. Se almacenan dentro del documento del proyecto, por lo
 * que delega en ProjectsService. El acceso/rol se valida en el servicio.
 */
@Controller('projects/:projectId/statuses')
@UseGuards(RolesGuard)
export class ProjectStatusesController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.listStatuses(projectId, user);
  }

  @Post()
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.addStatus(projectId, dto, user);
  }

  @Patch(':statusId')
  update(
    @Param('projectId') projectId: string,
    @Param('statusId') statusId: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.updateStatus(projectId, statusId, dto, user);
  }

  @Patch(':statusId/archive')
  archive(
    @Param('projectId') projectId: string,
    @Param('statusId') statusId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.archiveStatus(projectId, statusId, user);
  }
}
