import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Universitas Contoh' })
  @IsString()
  @MinLength(3)
  universityName!: string;

  @ApiProperty({ example: 'Budi Santoso' })
  @IsString()
  @MinLength(3)
  fullName!: string;

  @ApiProperty({ example: 'test@test.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'testtest' })
  @IsString()
  @MinLength(8)
  password!: string;
}
