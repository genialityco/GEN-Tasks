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
import { AuthenticatedUser } from '@gen-task/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ProjectsService } from '../projects/projects.service';
import {
  CreateCustomFieldDto,
  UpdateCustomFieldDto,
} from '../projects/dto/custom-field.dto';
import { RolesGuard } from '../common/guards/roles.guard';

/**
 * Campos personalizados del proyecto. Persisten en el documento del proyecto;
 * delega en ProjectsService. El acceso/rol se valida en el servicio.
 */
@Controller('projects/:projectId/custom-fields')
@UseGuards(RolesGuard)
export class CustomFieldsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.listCustomFields(projectId, user);
  }

  @Post()
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateCustomFieldDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.addCustomField(projectId, dto, user);
  }

  @Patch(':fieldId')
  update(
    @Param('projectId') projectId: string,
    @Param('fieldId') fieldId: string,
    @Body() dto: UpdateCustomFieldDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.updateCustomField(projectId, fieldId, dto, user);
  }

  @Patch(':fieldId/archive')
  archive(
    @Param('projectId') projectId: string,
    @Param('fieldId') fieldId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.archiveCustomField(projectId, fieldId, user);
  }

  @Delete(':fieldId')
  remove(
    @Param('projectId') projectId: string,
    @Param('fieldId') fieldId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.deleteCustomField(projectId, fieldId, user);
  }
}
