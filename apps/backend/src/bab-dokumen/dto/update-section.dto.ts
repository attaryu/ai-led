import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

export class TableSpecEntryDto {
  @ApiPropertyOptional()
  id!: string;

  @ApiPropertyOptional()
  caption!: string;

  @ApiPropertyOptional({ type: [String] })
  columns!: string[];
}

export class UpdateSectionDto {
  @ApiPropertyOptional({ example: 'Kebijakan Tata Pamong' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Bahas dasar hukum penetapan tata pamong' })
  @IsOptional()
  @IsString()
  guidance?: string;

  // Autosave kanvas section-view (bab-pipeline.service.ts::updateSection) --
  // jalur BEDA dari title/guidance: tulis langsung, tidak mereset apa pun.
  @ApiPropertyOptional({ example: { type: 'doc', content: [{ type: 'paragraph' }] } })
  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  // Instruksi tabel section ini (bukan hasil isian) -- jalur independen sama
  // seperti `content`, ditulis apa adanya. Lihat schema.prisma::ChapterSection.tableSpec.
  @ApiPropertyOptional({ type: [TableSpecEntryDto] })
  @IsOptional()
  @IsArray()
  tableSpec?: TableSpecEntryDto[];
}
