import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateBabDokumenDto {
  @ApiPropertyOptional({ example: 'Bab 1 Kondisi Eksternal dan Internal' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  chapterTitle?: string;

  // Editor content (Tiptap-style JSON) — loosely validated, matches the jsonb column (docs/database.md §5).
  @ApiPropertyOptional({
    example: { type: 'doc', content: [] },
  })
  @IsOptional()
  @IsObject()
  workingContent?: Record<string, unknown>;
}
