import { ApiProperty } from '@nestjs/swagger';
import { AssessmentStatus } from '@ai-led/db';

export class AssessmentOverviewSessionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: AssessmentStatus })
  status!: AssessmentStatus;

  @ApiProperty()
  totalIndicators!: number;

  @ApiProperty()
  completedIndicators!: number;

  @ApiProperty({ description: 'ISO 8601' })
  createdAt!: string;
}

/** Ringkasan penilaian satu Dokumen LED — dihitung dari sesi TERBARU dokumen tersebut. */
export class AssessmentOverviewItemDto {
  @ApiProperty()
  documentId!: string;

  @ApiProperty()
  studyProgramId!: string;

  @ApiProperty({ type: AssessmentOverviewSessionDto, nullable: true })
  session!: AssessmentOverviewSessionDto | null;

  @ApiProperty({ description: 'Hasil sesi terbaru dengan skor' })
  scored!: number;

  @ApiProperty({ description: 'Hasil sesi terbaru tanpa skor tapi dengan error' })
  failed!: number;

  @ApiProperty({ type: Number, nullable: true, description: 'Rata-rata skor, 2 desimal; null bila belum ada skor' })
  averageScore!: number | null;

  @ApiProperty({ description: 'Hasil dengan skor <= 2' })
  lowScoreCount!: number;

  @ApiProperty({ description: 'Jumlah verdict Penjamin Mutu pada dokumen (lintas sesi)' })
  reviewed!: number;

  @ApiProperty({ description: 'Verdict yang finalScore-nya berbeda dari machineScoreAtReview' })
  corrected!: number;
}
