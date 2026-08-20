import { IsOptional, IsString } from 'class-validator';

export class GenerateBabDto {
  @IsOptional()
  @IsString()
  prompt?: string;
}
