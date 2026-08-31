import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { TenantModule } from './tenant/tenant.module';
import { TenantsModule } from './tenants/tenants.module';
import { ProgramStudiModule } from './program-studi/program-studi.module';
import { DokumenLedModule } from './dokumen-led/dokumen-led.module';
import { BabDokumenModule } from './bab-dokumen/bab-dokumen.module';
import { JobsModule } from './jobs/jobs.module';
import { UsersModule } from './users/users.module';
import { BuktiDukungModule } from './bukti-dukung/bukti-dukung.module';
import { EvidenceFolderModule } from './evidence-folder/evidence-folder.module';
import { StorageModule } from './storage/storage.module';
import { AssessmentModule } from './assessment/assessment.module';
import { AccreditationSetModule } from './accreditation-set/accreditation-set.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    TenantModule,
    TenantsModule,
    ProgramStudiModule,
    DokumenLedModule,
    BabDokumenModule,
    JobsModule,
    UsersModule,
    BuktiDukungModule,
    EvidenceFolderModule,
    StorageModule,
    AssessmentModule,
    AccreditationSetModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
