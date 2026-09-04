import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Jenjang, PeringkatAkreditasi } from '@ai-led/db';

export class CreateProgramStudiDto {
  @ApiProperty({ example: 'Teknik Informatika' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiProperty({ example: 'IF' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @ApiProperty({ enum: Jenjang })
  @IsEnum(Jenjang)
  level!: Jenjang;

  @ApiProperty({ example: 'Fakultas Teknologi Informasi' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  faculty!: string;

  @ApiProperty({ example: 'Dr. Budi Santoso, S.Kom., M.T.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  programHead!: string;

  @ApiProperty({ enum: PeringkatAkreditasi })
  @IsEnum(PeringkatAkreditasi)
  accreditationRank!: PeringkatAkreditasi;

  @ApiPropertyOptional({ example: '123/SK/BAN-PT/Akred/S/III/2026' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  accreditationDecreeNumber?: string;

  @ApiPropertyOptional({ example: '2031-03-01' })
  @IsOptional()
  @IsDateString()
  accreditationValidUntil?: string;
}
