import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
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

  @Post()
  @Protected(...BUKTI_DUKUNG_ROLES)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  async create(
    @Body() dto: CreateBuktiDukungDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File wajib diunggah');
    }
    return this.buktiDukungService.create(dto, file);
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
