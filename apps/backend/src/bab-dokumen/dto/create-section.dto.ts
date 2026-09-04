import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSectionDto {
  @ApiProperty({ example: 'Kebijakan Tata Pamong' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: 'Bahas dasar hukum penetapan tata pamong' })
  @IsString()
  @IsNotEmpty()
  guidance!: string;

  @ApiPropertyOptional({ description: 'Id ChapterSection induk -- diisi berarti section ini sub-sub-bab.' })
  @IsOptional()
  @IsString()
  parentId?: string;
}
