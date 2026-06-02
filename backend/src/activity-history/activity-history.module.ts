import { Module } from '@nestjs/common';
import { ActivityHistoryService } from './activity-history.service';

@Module({
  providers: [ActivityHistoryService],
  exports: [ActivityHistoryService],
})
export class ActivityHistoryModule {}
