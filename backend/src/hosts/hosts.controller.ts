import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { UserRole } from '@gen-task/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { OrganizationAccessGuard } from '../common/guards/organization-access.guard';
import { HostsService } from './hosts.service';

@Controller('organizations/:organizationId/hosts')
@UseGuards(RolesGuard, OrganizationAccessGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.GESTOR)
export class HostsController {
  constructor(private readonly hosts: HostsService) {}

  @Get()
  list(@Param('organizationId') organizationId: string) {
    return this.hosts.listByOrganization(organizationId);
  }
}
