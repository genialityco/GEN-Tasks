import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { GestoresModule } from '../gestores/gestores.module';
import { ActivityHistoryModule } from '../activity-history/activity-history.module';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';

@Module({
  imports: [ProjectsModule, GestoresModule, ActivityHistoryModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
