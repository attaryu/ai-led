import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class RemoveEvidenceFolderDto {
  @ApiProperty({ example: ['clx1a2b3c4d5e6f7g8h9i0j1'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids!: string[];
}
