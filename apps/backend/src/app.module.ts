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

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    TenantModule,
    TenantsModule,
    ProgramStudiModule,
    DokumenLedModule,
    BabDokumenModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
