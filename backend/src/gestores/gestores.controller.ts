import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@gen-task/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { OrganizationAccessGuard } from '../common/guards/organization-access.guard';
import { GestoresService } from './gestores.service';
import { UpsertGestorAccessRuleDto } from './dto/gestor-access-rule.dto';

/**
 * Gestion de gestores y sus reglas de acceso/visibilidad.
 * Solo SUPER_ADMIN y ADMIN.
 */
@Controller('organizations/:organizationId/gestores')
@UseGuards(RolesGuard, OrganizationAccessGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class GestoresController {
  constructor(private readonly gestores: GestoresService) {}

  @Get()
  list(@Param('organizationId') organizationId: string) {
    return this.gestores.listGestores(organizationId);
  }

  @Get('rules/:projectId')
  rulesByProject(@Param('projectId') projectId: string) {
    return this.gestores.listRulesByProject(projectId);
  }

  /** Crea o reemplaza la regla de acceso de un gestor sobre un proyecto. */
  @Put('access-rules')
  upsertRule(
    @Param('organizationId') organizationId: string,
    @Body() dto: UpsertGestorAccessRuleDto,
  ) {
    return this.gestores.upsertRule(organizationId, dto);
  }
}
