import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@ai-led/db';
import { Protected } from '../tenant/protected.decorator';
import { EvidenceFolderService } from './evidence-folder.service';
import { CreateEvidenceFolderDto } from './dto/create-evidence-folder.dto';
import { RenameEvidenceFolderDto } from './dto/rename-evidence-folder.dto';
import { MoveEvidenceFolderDto } from './dto/move-evidence-folder.dto';
import { RemoveEvidenceFolderDto } from './dto/remove-evidence-folder.dto';
import { AssignEvidenceFolderDto } from './dto/assign-evidence-folder.dto';
import { EnsureFolderPathsDto } from './dto/ensure-folder-paths.dto';

// Sama persis dengan BUKTI_DUKUNG_ROLES di bukti-dukung.controller.ts — ADMIN tidak
// pernah punya akses ke perpustakaan bukti dukung (docs/database.md §7).
const EVIDENCE_FOLDER_ROLES = [Role.PIMPINAN, Role.PENJAMIN_MUTU, Role.PENYUSUN];

@ApiTags('evidence-folder')
@ApiBearerAuth()
@Controller('evidence-folder')
export class EvidenceFolderController {
  constructor(private readonly evidenceFolderService: EvidenceFolderService) {}

  @Get()
  @Protected(...EVIDENCE_FOLDER_ROLES)
  findByScope(@Query('ownerType') ownerType: string, @Query('studyProgramId') studyProgramId?: string) {
    return this.evidenceFolderService.findByScope(ownerType, studyProgramId);
  }

  @Post()
  @Protected(...EVIDENCE_FOLDER_ROLES)
  create(@Body() dto: CreateEvidenceFolderDto) {
    return this.evidenceFolderService.create(dto);
  }

  @Patch(':id')
  @Protected(...EVIDENCE_FOLDER_ROLES)
  rename(@Param('id') id: string, @Body() dto: RenameEvidenceFolderDto) {
    return this.evidenceFolderService.rename(id, dto);
  }

  @Patch(':id/move')
  @Protected(...EVIDENCE_FOLDER_ROLES)
  move(@Param('id') id: string, @Body() dto: MoveEvidenceFolderDto) {
    return this.evidenceFolderService.move(id, dto);
  }

  // Bulk-by-ids, bukan `DELETE /:id` — removeMany() selalu dipanggil dengan
  // satu himpunan id (hapus berantai dari evidence.repository.ts), dan body
  // pada DELETE HTTP tidak konsisten didukung lintas klien/proxy.
  @Post('remove')
  @Protected(...EVIDENCE_FOLDER_ROLES)
  @HttpCode(204)
  removeMany(@Body() dto: RemoveEvidenceFolderDto) {
    return this.evidenceFolderService.removeMany(dto);
  }

  @Post('assign')
  @Protected(...EVIDENCE_FOLDER_ROLES)
  @HttpCode(204)
  assignMany(@Body() dto: AssignEvidenceFolderDto) {
    return this.evidenceFolderService.assignMany(dto);
  }

  @Post('ensure-paths')
  @Protected(...EVIDENCE_FOLDER_ROLES)
  ensurePaths(@Body() dto: EnsureFolderPathsDto) {
    return this.evidenceFolderService.ensurePaths(dto);
  }
}
