import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class GenerateOutlineDto {
  // true = reset semua section yang sudah ada (v1: tanpa merge pintar) — lihat db/generation_client.py::create_chapter_sections.
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  overwrite?: boolean;
}
