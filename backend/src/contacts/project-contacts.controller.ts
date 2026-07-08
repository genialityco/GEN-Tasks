import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '@gen-task/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ContactsService } from './contacts.service';

/**
 * Contactos de un proyecto (derivados de las actividades que los referencian).
 * La ruta solo expone `:projectId`, por lo que el control de acceso (rol y
 * tenant scoping) se resuelve en el servicio a partir del proyecto.
 */
@Controller('projects/:projectId')
@UseGuards(RolesGuard)
export class ProjectContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get('contacts')
  listByProject(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.contacts.listByProject(projectId, user);
  }
}
