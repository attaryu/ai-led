import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateBabDokumenDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  judulBab?: string;

  // Editor content (Tiptap-style JSON) - shape is intentionally not deeply
  // validated here, matches the loose jsonb column in docs/database.md §5.
  @IsOptional()
  @IsObject()
  kontenKerja?: Record<string, unknown>;
}
