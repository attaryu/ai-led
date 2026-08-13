import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateDokumenLedDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  judul!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  tahunAkademik!: string;

  @IsOptional()
  @IsDateString()
  tenggat?: string;
}
