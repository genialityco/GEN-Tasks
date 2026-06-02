import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { GestoresController } from './gestores.controller';
import { GestoresService } from './gestores.service';

@Module({
  imports: [UsersModule],
  controllers: [GestoresController],
  providers: [GestoresService],
  exports: [GestoresService],
})
export class GestoresModule {}
