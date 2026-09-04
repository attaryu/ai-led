import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { OwnerTipe } from '@ai-led/db';

export class CreateEvidenceFolderDto {
  @ApiProperty({ enum: OwnerTipe })
  @IsEnum(OwnerTipe)
  ownerType!: OwnerTipe;

  // Required iff ownerType = PROGRAM_STUDI — validated in the service, depends on ownerType.
  @ApiPropertyOptional({ example: 'clx1a2b3c4d5e6f7g8h9i0j1' })
  @IsOptional()
  @IsString()
  studyProgramId?: string;

  @ApiProperty({ example: 'Kriteria 4' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  // `undefined`/`null` = root of its scope.
  @ApiPropertyOptional({ example: 'clx1a2b3c4d5e6f7g8h9i0j1' })
  @IsOptional()
  @IsString()
  parentId?: string | null;
}
