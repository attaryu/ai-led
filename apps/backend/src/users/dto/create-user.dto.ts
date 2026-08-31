import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '@ai-led/db';

export class CreateUserDto {
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

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role!: Role;

  /** Wajib bila `role === PENYUSUN` — ditegakkan di `UsersService.create`. */
  @ApiPropertyOptional({ example: 'clx1a2b3c4d5e6f7g8h9i0j1' })
  @IsOptional()
  @IsString()
  studyProgramId?: string;
}
