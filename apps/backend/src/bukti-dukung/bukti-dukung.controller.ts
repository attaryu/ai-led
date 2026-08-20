import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@ai-led/db';
import { Protected } from '../tenant/protected.decorator';
import { BuktiDukungService } from './bukti-dukung.service';
import { CreateBuktiDukungDto } from './dto/create-bukti-dukung.dto';

// docs/database.md §7: ADMIN tidak punya akses ke bukti dukung sama sekali —
// dikecualikan dari daftar ini dengan sengaja, bukan lupa.
const BUKTI_DUKUNG_ROLES = [Role.PIMPINAN, Role.PENJAMIN_MUTU, Role.PENYUSUN];

@ApiTags('bukti-dukung')
@ApiBearerAuth()
@Controller('bukti-dukung')
export class BuktiDukungController {
  constructor(private readonly buktiDukungService: BuktiDukungService) {}

  /**
   * File-nya sendiri sudah sampai ke R2 langsung dari browser sebelum ini
   * dipanggil (POST /storage/presigned-upload lalu PUT langsung ke R2) —
   * endpoint ini cuma mengonfirmasi & mencatat barisnya. Tidak ada lagi
   * multipart/FileInterceptor di sini (tracker: Cloudflare R2 Storage Module).
   */
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
}
