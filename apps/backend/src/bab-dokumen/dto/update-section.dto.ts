import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

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
  @ApiPropertyOptional({ example: { format: 'html', body: '<p>...</p>' } })
  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;
}
