import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser } from '@gen-task/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import {
  ChangeStatusDto,
  UpdateActivityDto,
} from './dto/update-activity.dto';
import { QueryActivitiesDto } from './dto/query-activities.dto';

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

  @Get('activities/:activityId/history')
  history(
    @Param('activityId') activityId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.activities.getHistory(activityId, user);
  }
}
