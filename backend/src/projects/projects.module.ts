import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectStatusesController } from '../project-statuses/project-statuses.controller';
import { CustomFieldsController } from '../custom-fields/custom-fields.controller';

/**
 * Modulo de proyectos. Incluye los controladores de estados y campos
 * personalizados porque ambos persisten dentro del documento del proyecto y
 * comparten ProjectsService.
 */
@Module({
  imports: [OrganizationsModule],
  controllers: [
    ProjectsController,
    ProjectStatusesController,
    CustomFieldsController,
  ],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
