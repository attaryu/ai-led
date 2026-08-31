import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, TipePanduan } from '@ai-led/db';
import { Protected } from '../tenant/protected.decorator';
import { AccreditationSetService } from './accreditation-set.service';
import { CreateAccreditationSetDto } from './dto/create-accreditation-set.dto';
import { UpdateAccreditationSetDto } from './dto/update-accreditation-set.dto';
import { ReplaceCriteriaDto } from './dto/replace-criteria.dto';
import { AttachSetDocumentDto } from './dto/attach-set-document.dto';

// Sama seperti dokumen-led/bab-dokumen: PIMPINAN cuma baca (governance/oversight),
// PENJAMIN_MUTU dan PENYUSUN yang menyusun/mengelola. ADMIN tidak punya akses domain.
const READ_ROLES = [Role.PIMPINAN, Role.PENJAMIN_MUTU, Role.PENYUSUN];
const WRITE_ROLES = [Role.PENJAMIN_MUTU, Role.PENYUSUN];

@ApiTags('accreditation-set')
@ApiBearerAuth()
@Controller('accreditation-sets')
export class AccreditationSetController {
  constructor(private readonly accreditationSetService: AccreditationSetService) {}

  @Get()
  @Protected(...READ_ROLES)
  findAll() {
    return this.accreditationSetService.findAll();
  }

  @Get(':id')
  @Protected(...READ_ROLES)
  findById(@Param('id') id: string) {
    return this.accreditationSetService.findById(id);
  }

  @Post()
  @Protected(...WRITE_ROLES)
  create(@Body() dto: CreateAccreditationSetDto) {
    return this.accreditationSetService.create(dto);
  }

  @Patch(':id')
  @Protected(...WRITE_ROLES)
  update(@Param('id') id: string, @Body() dto: UpdateAccreditationSetDto) {
    return this.accreditationSetService.update(id, dto);
  }

  @Post(':id/mark-ready')
  @Protected(...WRITE_ROLES)
  markReady(@Param('id') id: string) {
    return this.accreditationSetService.markReady(id);
  }

  @Delete(':id')
  @Protected(...WRITE_ROLES)
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.accreditationSetService.remove(id);
  }

  @Post(':id/duplicate')
  @Protected(...WRITE_ROLES)
  duplicate(@Param('id') id: string) {
    return this.accreditationSetService.duplicate(id);
  }

  @Post(':id/criteria/replace-all')
  @Protected(...WRITE_ROLES)
  replaceCriteria(@Param('id') id: string, @Body() dto: ReplaceCriteriaDto) {
    return this.accreditationSetService.replaceCriteria(id, dto);
  }

  @Delete(':id/criteria/:criterionId')
  @Protected(...WRITE_ROLES)
  @HttpCode(204)
  removeCriterion(@Param('id') id: string, @Param('criterionId') criterionId: string) {
    return this.accreditationSetService.removeCriterion(id, criterionId);
  }

  @Patch(':id/documents/:type')
  @Protected(...WRITE_ROLES)
  attachDocument(
    @Param('id') id: string,
    @Param('type') type: TipePanduan,
    @Body() dto: AttachSetDocumentDto,
  ) {
    return this.accreditationSetService.attachDocument(id, type, dto);
  }

  @Delete(':id/documents/:type')
  @Protected(...WRITE_ROLES)
  @HttpCode(204)
  removeDocument(@Param('id') id: string, @Param('type') type: TipePanduan) {
    return this.accreditationSetService.removeDocument(id, type);
  }
}
