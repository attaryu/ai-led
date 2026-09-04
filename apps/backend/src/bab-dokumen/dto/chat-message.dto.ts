import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ChatMessageDto {
  @ApiProperty({ example: 'Bisa perbaiki paragraf ke-2 supaya lebih ringkas?' })
  @IsString()
  @IsNotEmpty()
  message!: string;
}
