import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { OwnerTipe } from '@ai-led/db';

export class CreateBuktiDukungDto {
  @ApiProperty({ enum: OwnerTipe })
  @IsEnum(OwnerTipe)
  ownerType!: OwnerTipe;

  // Required iff ownerType = PROGRAM_STUDI — validated in the service, depends on ownerType.
  @ApiPropertyOptional({ example: 'clx1a2b3c4d5e6f7g8h9i0j1' })
  @IsOptional()
  @IsString()
  studyProgramId?: string;

  // Display name shown to the user; defaults to the original filename if empty.
  @ApiPropertyOptional({ example: 'SK Tim Penyusun LED' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  documentName?: string;

  // R2 object key from POST /storage/presigned-upload — size/type are re-read from R2 in the service, not trusted here.
  @ApiProperty({ example: 'uploads/2026/sk-tim-penyusun.pdf' })
  @IsString()
  @IsNotEmpty()
  fileKey!: string;

  // `undefined`/`null` = root of the target scope. Verified against ownerType/studyProgramId in the service.
  @ApiPropertyOptional({ example: 'clx1a2b3c4d5e6f7g8h9i0j1' })
  @IsOptional()
  @IsString()
  folderId?: string | null;

  // AMI indicator numbers this evidence is tagged for (evidence-indicator-tag.entity.ts) — invisible to the assessment agent for any indicator not listed here.
  @ApiPropertyOptional({ example: [1, 4] })
  @IsOptional()
  @IsInt({ each: true })
  indicatorNos?: number[];

  // Which AccreditationSet indicatorNos refers to — required together with indicatorNos
  // (validated in the service): indicator numbers restart from 1 in every set, so a bare
  // number is ambiguous once a prodi has projects on more than one set.
  @ApiPropertyOptional({ example: 'clx1a2b3c4d5e6f7g8h9i0j1' })
  @IsOptional()
  @IsString()
  accreditationSetId?: string;
}
