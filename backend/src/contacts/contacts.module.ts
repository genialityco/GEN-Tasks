import { Module } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { ProjectContactsController } from './project-contacts.controller';
import { ContactsService } from './contacts.service';

/**
 * Modulo de contactos. Los contactos viven en la coleccion `contacts` y sus
 * campos personalizados se almacenan en el documento de la organizacion. La
 * relacion con proyectos se establece desde las actividades (`contactIds`).
 */
@Module({
  controllers: [ContactsController, ProjectContactsController],
  providers: [ContactsService],
})
export class ContactsModule {}
