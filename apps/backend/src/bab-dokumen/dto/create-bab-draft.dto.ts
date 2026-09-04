import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBabDraftDto {
  @ApiPropertyOptional({ example: 'Draft alternatif 2' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;
}
