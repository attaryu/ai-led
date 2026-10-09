import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateDokumenLedDto {
  @ApiProperty({ example: 'LED Teknik Informatika 2026' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @ApiProperty({ example: '2025/2026' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  academicYear!: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  deadline?: string;

  // Menentukan struktur bab yang distempel ledProjectRepository.create() --
  // lihat ChapterTemplate (packages/db/prisma/schema.prisma).
  @ApiPropertyOptional({ example: 'clx1a2b3c4d5e6f7g8h9i0j1' })
  @IsOptional()
  @IsString()
  accreditationSetId?: string;

  // LKPS pilihan dokumen ini. Harus LKPS milik program studi dokumen yang sama
  // (divalidasi di service); sumber data LKPS yang dipakai AMI untuk dokumen ini.
  @ApiPropertyOptional({ example: 'clx1a2b3c4d5e6f7g8h9i0j1' })
  @IsOptional()
  @IsString()
  lkpsEvidenceId?: string;
}
