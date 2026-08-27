import { IsOptional, IsString } from 'class-validator';

export class GenerateBabDto {
  @IsOptional()
  @IsString()
  prompt?: string;

  // Names the recommend-step's empty draft so the pipeline can scope Evidence to its confirmed selection.
  @IsOptional()
  @IsString()
  draftId?: string;
}
