import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsOptional, IsString } from 'class-validator';

export class AssignEvidenceFolderDto {
  @ApiProperty({ example: ['clx1a2b3c4d5e6f7g8h9i0j1'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  evidenceIds!: string[];

  // `null`/omitted = move to the root of the caller's scope.
  @ApiPropertyOptional({ example: 'clx1a2b3c4d5e6f7g8h9i0j1' })
  @IsOptional()
  @IsString()
  folderId?: string | null;
}
