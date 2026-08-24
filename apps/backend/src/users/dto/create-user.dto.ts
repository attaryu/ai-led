import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '@ai-led/db';

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(Role)
  role!: Role;

  /** Wajib bila `role === PENYUSUN` — ditegakkan di `UsersService.create`. */
  @IsOptional()
  @IsString()
  studyProgramId?: string;
}
