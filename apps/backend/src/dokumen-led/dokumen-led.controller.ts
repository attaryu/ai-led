import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@ai-led/db';
import { Protected } from '../tenant/protected.decorator';
import { DokumenLedService } from './dokumen-led.service';
import { CreateDokumenLedDto } from './dto/create-dokumen-led.dto';
import { TriggerAssessmentDto } from './dto/trigger-assessment.dto';
import { UpdateDokumenLedDto } from './dto/update-dokumen-led.dto';

// Nested under program-studi for creation/listing (needs parent context),
// flat by id for read/update/delete (id is already globally unique).
//
// Role split per docs/database.md §2: ADMIN has zero access to LED content
// at all (back-office only), PIMPINAN is read-only, PENJAMIN_MUTU has full
// content rights, PENYUSUN can create/edit but not delete (PENJAMIN_MUTU
// only, since deleting an entire LED project is the more destructive action).
const READ_ROLES = [Role.PIMPINAN, Role.PENJAMIN_MUTU, Role.PENYUSUN];
const WRITE_ROLES = [Role.PENJAMIN_MUTU, Role.PENYUSUN];

@ApiTags('dokumen-led')
@ApiBearerAuth()
@Controller()
export class DokumenLedController {
  constructor(private readonly dokumenLedService: DokumenLedService) {}

  @Post('program-studi/:programStudiId/dokumen')
  @Protected(...WRITE_ROLES)
  create(
    @Param('programStudiId') programStudiId: string,
    @Body() dto: CreateDokumenLedDto,
  ) {
    return this.dokumenLedService.create(programStudiId, dto);
  }

  @Get('program-studi/:programStudiId/dokumen')
  @Protected(...READ_ROLES)
  findAllForProgramStudi(@Param('programStudiId') programStudiId: string) {
    return this.dokumenLedService.findAllForProgramStudi(programStudiId);
  }

  /** Lintas prodi — Dashboard Utama (§4.0), notes attar.md #6. */
  @Get('dokumen')
  @Protected(...READ_ROLES)
  findAllForTenant() {
    return this.dokumenLedService.findAllForTenant();
  }

  @Get('dokumen/:id')
  @Protected(...READ_ROLES)
  findOne(@Param('id') id: string) {
    return this.dokumenLedService.findOne(id);
  }

  @Patch('dokumen/:id')
  @Protected(...WRITE_ROLES)
  update(@Param('id') id: string, @Body() dto: UpdateDokumenLedDto) {
    return this.dokumenLedService.update(id, dto);
  }

  @Delete('dokumen/:id')
  @Protected(Role.PENJAMIN_MUTU)
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.dokumenLedService.remove(id);
  }

  @Post('dokumen/:id/assessment')
  @Protected(...WRITE_ROLES)
  @ApiOperation({
    summary: 'Trigger asesmen AMI untuk dokumen LED (Producer ASSESSMENT_AMI)',
  })
  triggerAssessment(
    @Param('id') id: string,
    @Body() dto?: TriggerAssessmentDto,
  ) {
    return this.dokumenLedService.triggerAssessment(id, dto);
  }
}

