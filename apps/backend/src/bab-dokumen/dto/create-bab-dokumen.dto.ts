import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Min, MaxLength } from 'class-validator';

export class CreateBabDokumenDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  chapterOrder!: number;

  @ApiProperty({ example: 'Bab 1 Kondisi Eksternal dan Internal' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  chapterTitle!: string;
}
