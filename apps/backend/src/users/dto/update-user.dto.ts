import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '@ai-led/db';

/**
 * Bentuk `PATCH /users/:id`. PIMPINAN hanya boleh mengisi `programStudiId`
 * (memindahkan Penyusun ke prodi lain, §4.2) — field lain ditolak di service.
 * ADMIN boleh mengisi semuanya untuk edit profil penuh.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  namaLengkap?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsString()
  programStudiId?: string;
}
