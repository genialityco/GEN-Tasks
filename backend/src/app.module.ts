import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { FirebaseModule } from './firebase/firebase.module';
import { StorageModule } from './storage/storage.module';
import { FirebaseAuthGuard } from './common/guards/firebase-auth.guard';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { ProjectsModule } from './projects/projects.module';
import { ActivitiesModule } from './activities/activities.module';
import { ActivityHistoryModule } from './activity-history/activity-history.module';
import { GestoresModule } from './gestores/gestores.module';
import { RulesModule } from './rules/rules.module';
import { HostsModule } from './hosts/hosts.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { ComplianceModule } from './compliance/compliance.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Infraestructura
    FirebaseModule,
    StorageModule,
    // Dominio
    AuthModule,
    UsersModule,
    OrganizationsModule,
    ProjectsModule,
    ActivitiesModule,
    ActivityHistoryModule,
    GestoresModule,
    RulesModule,
    HostsModule,
    WhatsappModule,
    ComplianceModule,
  ],
  providers: [
    // FirebaseAuthGuard global: protege todos los endpoints salvo los @Public.
    {
      provide: APP_GUARD,
      useClass: FirebaseAuthGuard,
    },
  ],
})
export class AppModule {}
