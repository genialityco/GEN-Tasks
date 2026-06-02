import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { RulesController } from './rules.controller';

@Module({
  imports: [ProjectsModule],
  controllers: [RulesController],
})
export class RulesModule {}
