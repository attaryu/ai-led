import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@ai-led/db';
import { Protected } from '../tenant/protected.decorator';
import { AccreditationSetService } from './accreditation-set.service';
import { UploadPanduanDto } from './dto/upload-panduan.dto';
import { ToggleSectionDto } from './dto/toggle-section.dto';

// Sama seperti dokumen-led/bab-dokumen: PIMPINAN cuma baca, PENJAMIN_MUTU/
// PENYUSUN yang mengelola.
const READ_ROLES = [Role.PIMPINAN, Role.PENJAMIN_MUTU, Role.PENYUSUN];
// Set & Panduan are tenant-wide: a prodi-scoped PENYUSUN must not edit what other prodi use.
const WRITE_ROLES = [Role.PENJAMIN_MUTU];

// Panduan Penulisan LED -- reusable antar AccreditationSet lewat
// AccreditationSet.panduanId (lihat migration `reusable_panduan_penulisan`),
// makanya namespace-nya sendiri, bukan nested di bawah /accreditation-sets/:id.
// Struktur bab/sub-bab (preview/confirm) TETAP diakses lewat
// /accreditation-sets/:id/structure/{preview,confirm} -- backend meresolve
// panduanId dari Set itu sendiri, jadi frontend tidak perlu tahu panduanId
// di titik itu.
@ApiTags('panduan')
@ApiBearerAuth()
@Controller('panduan')
export class PanduanController {
  constructor(private readonly accreditationSetService: AccreditationSetService) {}

  @Get()
  @Protected(...READ_ROLES)
  list() {
    return this.accreditationSetService.listPanduan();
  }

  @Post()
  @Protected(...WRITE_ROLES)
  upload(@Body() dto: UploadPanduanDto) {
    return this.accreditationSetService.uploadPanduan(dto);
  }

  @Post(':id/replace')
  @Protected(...WRITE_ROLES)
  replace(@Param('id') id: string, @Body() dto: UploadPanduanDto) {
    return this.accreditationSetService.replacePanduan(id, dto);
  }

  @Patch('sections/:subBabId')
  @Protected(...WRITE_ROLES)
  toggleSection(@Param('subBabId') subBabId: string, @Body() dto: ToggleSectionDto) {
    return this.accreditationSetService.toggleSection(subBabId, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Protected(...WRITE_ROLES)
  delete(@Param('id') id: string) {
    return this.accreditationSetService.deletePanduan(id);
  }
}
