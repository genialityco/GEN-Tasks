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
import {
  AuthenticatedUser,
  LogicalOperator,
  ProjectRule,
} from '@gen-task/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectsService } from '../projects/projects.service';
import {
  CreateProjectRuleDto,
  UpdateProjectRuleDto,
} from './dto/project-rule.dto';

/**
 * Condiciones y triggers del proyecto. Persisten en el array rules[] del
 * proyecto; delega en ProjectsService. La evaluacion de los triggers
 * (Fase 6) se conectara al motor de reglas en activities/whatsapp.
 */
@Controller('projects/:projectId/rules')
@UseGuards(RolesGuard)
export class RulesController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.listRules(projectId, user);
  }

  @Post()
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateProjectRuleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const rule: Omit<ProjectRule, 'id'> = {
      name: dto.name,
      event: dto.event,
      conditions: dto.conditions,
      logicalOperator: dto.logicalOperator ?? LogicalOperator.AND,
      actions: dto.actions,
      fromStatusId: dto.fromStatusId,
      toStatusId: dto.toStatusId,
      isActive: dto.isActive ?? true,
    };
    return this.projects.addRule(projectId, rule, user);
  }

  @Patch(':ruleId')
  update(
    @Param('projectId') projectId: string,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateProjectRuleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.updateRule(projectId, ruleId, dto, user);
  }

  @Delete(':ruleId')
  remove(
    @Param('projectId') projectId: string,
    @Param('ruleId') ruleId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.deleteRule(projectId, ruleId, user);
  }
}
