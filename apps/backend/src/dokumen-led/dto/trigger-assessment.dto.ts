import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class TriggerAssessmentDto {
  @ApiPropertyOptional({
    description:
      'Daftar kode/nama indikator yang akan dinilai (opsional, jika kosong akan menilai seluruh indikator)',
    example: ['C.1.a', 'C.1.b'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  indikatorList?: string[];
}
