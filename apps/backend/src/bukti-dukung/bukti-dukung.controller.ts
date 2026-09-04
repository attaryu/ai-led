import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@ai-led/db';
import { Protected } from '../tenant/protected.decorator';
import { BuktiDukungService } from './bukti-dukung.service';
import { CreateBuktiDukungDto } from './dto/create-bukti-dukung.dto';

// ADMIN has no bukti-dukung access at all (docs/database.md §7) — deliberately excluded.
const BUKTI_DUKUNG_ROLES = [Role.PIMPINAN, Role.PENJAMIN_MUTU, Role.PENYUSUN];

@ApiTags('bukti-dukung')
@ApiBearerAuth()
@Controller('bukti-dukung')
export class BuktiDukungController {
  constructor(private readonly buktiDukungService: BuktiDukungService) {}

  /** File already reached R2 via presigned PUT before this is called — this just confirms and records the row. */
  @Post()
  @Protected(...BUKTI_DUKUNG_ROLES)
  async create(@Body() dto: CreateBuktiDukungDto) {
    return this.buktiDukungService.create(dto);
  }

  @Get()
  @Protected(...BUKTI_DUKUNG_ROLES)
  findAll(@Query('programStudiId') programStudiId?: string) {
    return this.buktiDukungService.findAll(programStudiId);
  }

  @Delete(':id')
  @Protected(...BUKTI_DUKUNG_ROLES)
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.buktiDukungService.remove(id);
  }

  @Post(':id/retry')
  @Protected(...BUKTI_DUKUNG_ROLES)
  retry(@Param('id') id: string) {
    return this.buktiDukungService.retryIngestion(id);
  }
}
