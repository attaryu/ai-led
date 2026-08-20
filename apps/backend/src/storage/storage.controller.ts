import { randomUUID } from 'node:crypto';
import { BadRequestException, Controller, ForbiddenException, Get, Post, Query, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Protected } from '../tenant/protected.decorator';
import { TenantContextService } from '../tenant/tenant-context.service';
import { RequestUploadUrlDto } from './dto/request-upload-url.dto';
import { sanitizeFileName } from './storage-key.util';
import { StorageService } from './storage.service';

@ApiTags('storage')
@ApiBearerAuth()
@Controller('storage')
export class StorageController {
  constructor(
    private readonly storage: StorageService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /**
   * Isolasi per tenant (DoD): kunci objeknya SELALU dibangun dari
   * tenantId di token, tidak pernah dari input klien — klien tidak bisa
   * memilih path tenant lain untuk diunggah.
   */
  @Post('presigned-upload')
  @Protected()
  async presignedUpload(@Body() dto: RequestUploadUrlDto) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const key = `${tenantId}/uploads/${randomUUID()}-${sanitizeFileName(dto.fileName)}`;
    const uploadUrl = await this.storage.getUploadUrl(key, dto.contentType);
    return { key, uploadUrl };
  }

  /**
   * `key` datang dari klien (baris `BuktiDukung.fileUrl` dst.), jadi
   * divalidasi di sini — bukan cukup di sisi pemanggil — supaya tidak ada
   * jalan lain yang lupa mengeceknya sebelum menerbitkan URL ke objek
   * tenant lain.
   */
  @Get('presigned-download')
  @Protected()
  async presignedDownload(@Query('key') key?: string) {
    if (!key) {
      throw new BadRequestException('key wajib diisi');
    }
    const { tenantId } = this.tenantContext.getOrThrow();
    if (!key.startsWith(`${tenantId}/`)) {
      throw new ForbiddenException('Objek ini bukan milik tenant Anda');
    }
    const downloadUrl = await this.storage.getDownloadUrl(key);
    return { downloadUrl };
  }
}
