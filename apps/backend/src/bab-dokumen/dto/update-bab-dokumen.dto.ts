import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateBabDokumenDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  chapterTitle?: string;

  // Editor content (Tiptap-style JSON) — loosely validated, matches the jsonb column (docs/database.md §5).
  @IsOptional()
  @IsObject()
  workingContent?: Record<string, unknown>;
}
