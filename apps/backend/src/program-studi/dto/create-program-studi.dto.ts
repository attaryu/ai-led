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
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nama!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  kode!: string;

  @IsEnum(Jenjang)
  jenjang!: Jenjang;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fakultas!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  ketuaProdi!: string;

  @IsEnum(PeringkatAkreditasi)
  peringkatAkreditasi!: PeringkatAkreditasi;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nomorSkAkreditasi?: string;

  @IsOptional()
  @IsDateString()
  berlakuSampaiAkreditasi?: string;
}
