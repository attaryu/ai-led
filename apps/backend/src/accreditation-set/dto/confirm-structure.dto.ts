import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

// Node id yang TERCENTANG di modal "Pilih Struktur Pedoman" -- lihat
// apps/ai's api/routes/structure.py::ConfirmStructureRequest. Node yang
// tidak ada di sini (atau parennya tidak ada di sini) dibuang permanen.
export class ConfirmStructureDto {
  @ApiProperty({ example: ['1', '1.1', '2'] })
  @IsArray()
  @IsString({ each: true })
  acceptedIds!: string[];
}
