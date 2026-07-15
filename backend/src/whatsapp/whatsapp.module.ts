import { Module } from '@nestjs/common';
import { HostsModule } from '../hosts/hosts.module';
import { UsersModule } from '../users/users.module';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { WhatsappCloudApiService } from './whatsapp-cloud-api.service';
import { OrganizationResolverService } from './organization-resolver.service';
import { MessageTemplatesController } from './message-templates.controller';
import { MessageTemplatesService } from './message-templates.service';

@Module({
  imports: [HostsModule, UsersModule],
  controllers: [WhatsappController, MessageTemplatesController],
  providers: [
    WhatsappService,
    WhatsappCloudApiService,
    OrganizationResolverService,
    MessageTemplatesService,
  ],
  exports: [WhatsappService, WhatsappCloudApiService, MessageTemplatesService],
})
export class WhatsappModule {}
