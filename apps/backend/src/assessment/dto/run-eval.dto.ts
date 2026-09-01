import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class RunEvalDto {
  @ApiProperty({ example: 20, description: 'Jumlah indikator sesi ini yang dievaluasi RAGAS-nya, maks 64 (batas apps/ai).' })
  @IsInt()
  @Min(1)
  @Max(64)
  nIndicators!: number;
}
