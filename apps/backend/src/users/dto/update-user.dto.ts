import { IsString } from 'class-validator';

/** Bentuk `PATCH /users/:id` — Pimpinan memindahkan Penyusun ke prodi lain. */
export class UpdateUserDto {
  @IsString()
  programStudiId!: string;
}
