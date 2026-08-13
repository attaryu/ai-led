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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@ai-led/db';
import { Protected } from '../tenant/protected.decorator';
import { BabDokumenService } from './bab-dokumen.service';
import { CreateBabDokumenDto } from './dto/create-bab-dokumen.dto';
import { UpdateBabDokumenDto } from './dto/update-bab-dokumen.dto';
import { ReviewStatusDto } from './dto/review-status.dto';

// Same role split as DokumenLedController: ADMIN has zero access, PIMPINAN
// read-only, PENJAMIN_MUTU/PENYUSUN full content rights (minus the review
// actions, which are exclusive to one role each - see docs/database.md §5-6.
const READ_ROLES = [Role.PIMPINAN, Role.PENJAMIN_MUTU, Role.PENYUSUN];
const WRITE_ROLES = [Role.PENJAMIN_MUTU, Role.PENYUSUN];

@ApiTags('bab-dokumen')
@ApiBearerAuth()
@Controller()
export class BabDokumenController {
  constructor(private readonly babDokumenService: BabDokumenService) {}

  @Post('dokumen/:dokumenId/bab')
  @Protected(...WRITE_ROLES)
  create(
    @Param('dokumenId') dokumenId: string,
    @Body() dto: CreateBabDokumenDto,
  ) {
    return this.babDokumenService.create(dokumenId, dto);
  }

  @Get('dokumen/:dokumenId/bab')
  @Protected(...READ_ROLES)
  findAllForDokumen(@Param('dokumenId') dokumenId: string) {
    return this.babDokumenService.findAllForDokumen(dokumenId);
  }

  @Get('bab/:id')
  @Protected(...READ_ROLES)
  findOne(@Param('id') id: string) {
    return this.babDokumenService.findOne(id);
  }

  @Patch('bab/:id')
  @Protected(...WRITE_ROLES)
  update(@Param('id') id: string, @Body() dto: UpdateBabDokumenDto) {
    return this.babDokumenService.update(id, dto);
  }

  @Post('bab/:id/submit-review')
  @Protected(Role.PENYUSUN)
  @HttpCode(200)
  submitForReview(@Param('id') id: string) {
    return this.babDokumenService.submitForReview(id);
  }

  @Patch('bab/:id/review-status')
  @Protected(Role.PENJAMIN_MUTU)
  setReviewStatus(@Param('id') id: string, @Body() dto: ReviewStatusDto) {
    return this.babDokumenService.setReviewStatus(id, dto);
  }

  @Delete('bab/:id')
  @Protected(Role.PENJAMIN_MUTU)
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.babDokumenService.remove(id);
  }
}
