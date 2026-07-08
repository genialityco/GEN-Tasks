import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthenticatedUser } from '@gen-task/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  ActivitiesService,
  type UploadedFile as UploadedFileType,
} from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import {
  ChangeStatusDto,
  UpdateActivityDto,
} from './dto/update-activity.dto';
import { QueryActivitiesDto } from './dto/query-activities.dto';
import { ImportActivitiesDto } from './dto/import-activities.dto';

/**
 * Actividades. El tenant scoping y las restricciones de gestor se aplican en
 * el servicio (las rutas exponen projectId/activityId, no organizationId).
 */
@Controller()
@UseGuards(RolesGuard)
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get('projects/:projectId/activities')
  list(
    @Param('projectId') projectId: string,
    @Query() query: QueryActivitiesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.activities.listByProject(projectId, query, user);
  }

  @Post('projects/:projectId/activities')
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateActivityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.activities.create(projectId, dto, user);
  }

  @Post('projects/:projectId/activities/import')
  importActivities(
    @Param('projectId') projectId: string,
    @Body() dto: ImportActivitiesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.activities.importActivities(projectId, dto.rows, user);
  }

  @Get('projects/:projectId/activities/export')
  exportActivities(
    @Param('projectId') projectId: string,
    @Query() query: QueryActivitiesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.activities.exportActivities(projectId, query, user);
  }

  @Post('projects/:projectId/uploads')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('projectId') projectId: string,
    @UploadedFile() file: UploadedFileType,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.activities.uploadAttachment(projectId, file, user);
  }

  @Get('activities/:activityId')
  findOne(
    @Param('activityId') activityId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.activities.findOne(activityId, user);
  }

  @Patch('activities/:activityId')
  update(
    @Param('activityId') activityId: string,
    @Body() dto: UpdateActivityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.activities.update(activityId, dto, user);
  }

  @Patch('activities/:activityId/status')
  changeStatus(
    @Param('activityId') activityId: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.activities.changeStatus(activityId, dto, user);
  }

  @Patch('activities/:activityId/archive')
  archive(
    @Param('activityId') activityId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.activities.archive(activityId, user);
  }

  @Delete('activities/:activityId')
  remove(
    @Param('activityId') activityId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.activities.remove(activityId, user);
  }

  @Get('activities/:activityId/history')
  history(
    @Param('activityId') activityId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.activities.getHistory(activityId, user);
  }
}
