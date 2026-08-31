import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsObject } from 'class-validator';
import { JobType } from '@ai-led/db';

export class CreateJobDto {
  @ApiProperty({ enum: JobType })
  @IsEnum(JobType)
  type!: JobType;

  @ApiProperty({ example: { dokumenLedId: 'clx1a2b3c4d5e6f7g8h9i0j1' } })
  @IsObject()
  payload!: Record<string, unknown>;
}
