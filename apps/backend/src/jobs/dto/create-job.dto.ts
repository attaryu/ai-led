import { IsEnum, IsObject } from 'class-validator';
import { JobType } from '@ai-led/db';

export class CreateJobDto {
  @IsEnum(JobType)
  type!: JobType;

  @IsObject()
  payload!: Record<string, unknown>;
}
