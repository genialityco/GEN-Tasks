import { Module } from '@nestjs/common';
import { ActivityHistoryModule } from '../activity-history/activity-history.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { RuleEngineService } from './rule-engine.service';

/**
 * Motor de ejecucion de triggers. Separado de RulesModule (que solo gestiona el
 * CRUD de reglas) para que ActivitiesModule pueda consumirlo sin acoplar
 * controladores. WhatsappModule no depende de actividades, asi que no hay ciclo.
 */
@Module({
  imports: [ActivityHistoryModule, WhatsappModule],
  providers: [RuleEngineService],
  exports: [RuleEngineService],
})
export class RuleEngineModule {}
