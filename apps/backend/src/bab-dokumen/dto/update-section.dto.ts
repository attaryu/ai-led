import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateSectionDto {
  @ApiPropertyOptional({ example: 'Kebijakan Tata Pamong' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Bahas dasar hukum penetapan tata pamong' })
  @IsOptional()
  @IsString()
  guidance?: string;
}
