import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LedSourceMode } from '@ai-led/db';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/** Spasi di tepi dibuang sebelum validasi, supaya "   " dianggap kosong (IsNotEmpty saja meloloskannya). */
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class IkuInputDto {
  @ApiProperty({ example: 'IKU.REL.MHS.3' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  kode!: string;

  @ApiProperty({ example: 'Rata-rata minimal IPK lulusan dalam 3 tahun terakhir' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  indikator!: string;

  @ApiProperty({ example: 'PJJ: RIPK ≥ 3,25' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  target!: string;
}

export class TriggerSetorLedDto {
  @ApiProperty({
    type: [IkuInputDto],
    description: 'Daftar IKU yang diisi tabel analisisnya (1-200; `kode` unik dalam satu permintaan)',
  })
  @IsArray()
  @ArrayMinSize(1)
  // Tiap IKU memulai satu task + dua model LLM dan ikut tersimpan di payload job; tabel C5.1/C6.1 hanya puluhan baris.
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => IkuInputDto)
  ikuList!: IkuInputDto[];

  // EDITOR: worker meng-index teks bab saat ini sebagai LED; UNGGAHAN: berkas LED yang diunggah. Sama seperti AMI.
  @ApiPropertyOptional({ enum: LedSourceMode })
  @IsOptional()
  @IsEnum(LedSourceMode)
  sumberLed?: LedSourceMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lkpsBuktiDukungId?: string;

  // Harus salah satu dari apps/ai get_available_models(); divalidasi worker.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;
}
