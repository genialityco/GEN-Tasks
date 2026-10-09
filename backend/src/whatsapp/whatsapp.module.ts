import { Module } from '@nestjs/common';
import { HostsModule } from '../hosts/hosts.module';
import { UsersModule } from '../users/users.module';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { WhatsappCloudApiService } from './whatsapp-cloud-api.service';
import { OrganizationResolverService } from './organization-resolver.service';
import { MessageTemplatesController } from './message-templates.controller';
import { MessageTemplatesService } from './message-templates.service';
import { WhatsappTemplatesService } from './whatsapp-templates.service';
import { WhatsappGroupsService } from './whatsapp-groups.service';
import { WhatsappWebService } from './whatsapp-web.service';

@Module({
  imports: [HostsModule, UsersModule],
  controllers: [WhatsappController, MessageTemplatesController],
  providers: [
    WhatsappService,
    WhatsappCloudApiService,
    OrganizationResolverService,
    MessageTemplatesService,
    WhatsappTemplatesService,
    WhatsappGroupsService,
    WhatsappWebService,
  ],
  exports: [
    WhatsappService,
    WhatsappCloudApiService,
    MessageTemplatesService,
    WhatsappTemplatesService,
    WhatsappGroupsService,
  ],
})
export class WhatsappModule {}
