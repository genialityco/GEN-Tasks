import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { GestoresModule } from '../gestores/gestores.module';
import { ActivityHistoryModule } from '../activity-history/activity-history.module';
import { RuleEngineModule } from '../rules/rule-engine.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';

@Module({
  imports: [
    ProjectsModule,
    GestoresModule,
    ActivityHistoryModule,
    RuleEngineModule,
    NotificationsModule,
  ],
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
