import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RenameEvidenceFolderDto {
  @ApiProperty({ example: 'Kriteria 4' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}
