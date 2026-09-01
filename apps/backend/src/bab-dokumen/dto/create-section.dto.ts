import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateSectionDto {
  @ApiProperty({ example: 'Kebijakan Tata Pamong' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: 'Bahas dasar hukum penetapan tata pamong' })
  @IsString()
  @IsNotEmpty()
  guidance!: string;
}
