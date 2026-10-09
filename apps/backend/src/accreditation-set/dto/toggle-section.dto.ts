import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

// Nyala/matikan 1 SubBabTemplate yang SUDAH commit dari outline BARU, tanpa
// re-extract seluruh Panduan -- lihat SubBabTemplate.isActive di schema.prisma.
export class ToggleSectionDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  isActive!: boolean;
}
