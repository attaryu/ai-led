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
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  academicYear!: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;
}
