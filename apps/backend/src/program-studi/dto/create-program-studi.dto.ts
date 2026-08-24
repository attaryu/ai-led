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
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @IsEnum(Jenjang)
  level!: Jenjang;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  faculty!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  programHead!: string;

  @IsEnum(PeringkatAkreditasi)
  accreditationRank!: PeringkatAkreditasi;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  accreditationDecreeNumber?: string;

  @IsOptional()
  @IsDateString()
  accreditationValidUntil?: string;
}
