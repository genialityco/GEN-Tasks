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
import { AuthenticatedUser, UserRole } from '@gen-task/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { OrganizationAccessGuard } from '../common/guards/organization-access.guard';
import { ContactsService } from './contacts.service';
import {
  CreateContactFieldDto,
  UpdateContactFieldDto,
} from './dto/contact-field.dto';
import { CreateContactDto, UpdateContactDto } from './dto/contact.dto';
import { ImportContactsDto } from './dto/import-contacts.dto';

/**
 * Contactos y sus campos personalizados, a nivel de organizacion. Todas las
 * rutas exponen `:organizationId`, por lo que los guards aplican el tenant
 * scoping y restringen a ADMIN de la organizacion y SUPER_ADMIN.
 */
@Controller('organizations/:organizationId')
@UseGuards(RolesGuard, OrganizationAccessGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  // -- Campos de contacto -------------------------------------------------

  @Get('contact-fields')
  listFields(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.contacts.listFields(organizationId, user);
  }

  @Post('contact-fields')
  addField(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateContactFieldDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.contacts.addField(organizationId, dto, user);
  }

  @Patch('contact-fields/:fieldId')
  updateField(
    @Param('organizationId') organizationId: string,
    @Param('fieldId') fieldId: string,
    @Body() dto: UpdateContactFieldDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.contacts.updateField(organizationId, fieldId, dto, user);
  }

  @Patch('contact-fields/:fieldId/archive')
  archiveField(
    @Param('organizationId') organizationId: string,
    @Param('fieldId') fieldId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.contacts.archiveField(organizationId, fieldId, user);
  }

  @Delete('contact-fields/:fieldId')
  deleteField(
    @Param('organizationId') organizationId: string,
    @Param('fieldId') fieldId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.contacts.deleteField(organizationId, fieldId, user);
  }

  // -- Contactos ----------------------------------------------------------

  @Get('contacts/template')
  template(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.contacts.templateColumns(organizationId, user);
  }

  @Get('contacts')
  list(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.contacts.list(organizationId, user);
  }

  @Post('contacts')
  create(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateContactDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.contacts.create(organizationId, dto, user);
  }

  @Post('contacts/import')
  import(
    @Param('organizationId') organizationId: string,
    @Body() dto: ImportContactsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.contacts.import(organizationId, dto.rows, user);
  }

  @Patch('contacts/:contactId')
  update(
    @Param('organizationId') organizationId: string,
    @Param('contactId') contactId: string,
    @Body() dto: UpdateContactDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.contacts.update(organizationId, contactId, dto, user);
  }

  @Patch('contacts/:contactId/archive')
  archive(
    @Param('organizationId') organizationId: string,
    @Param('contactId') contactId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.contacts.archive(organizationId, contactId, user);
  }

  @Delete('contacts/:contactId')
  remove(
    @Param('organizationId') organizationId: string,
    @Param('contactId') contactId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.contacts.remove(organizationId, contactId, user);
  }
}
