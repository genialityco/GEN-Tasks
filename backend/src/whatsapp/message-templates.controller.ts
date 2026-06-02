import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@gen-task/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { OrganizationAccessGuard } from '../common/guards/organization-access.guard';
import { MessageTemplatesService } from './message-templates.service';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
} from './dto/whatsapp.dto';

@Controller()
@UseGuards(RolesGuard, OrganizationAccessGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class MessageTemplatesController {
  constructor(private readonly templates: MessageTemplatesService) {}

  @Get('organizations/:organizationId/message-templates')
  list(@Param('organizationId') organizationId: string) {
    return this.templates.listByOrganization(organizationId);
  }

  @Post('organizations/:organizationId/message-templates')
  create(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateTemplateDto,
  ) {
    return this.templates.create(organizationId, dto);
  }

  @Patch('message-templates/:templateId')
  update(
    @Param('templateId') templateId: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templates.update(templateId, dto);
  }

  @Delete('message-templates/:templateId')
  remove(@Param('templateId') templateId: string) {
    return this.templates.remove(templateId);
  }
}
