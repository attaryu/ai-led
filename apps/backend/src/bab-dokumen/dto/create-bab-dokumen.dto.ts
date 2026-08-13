import { IsInt, IsNotEmpty, IsString, Min, MaxLength } from 'class-validator';

export class CreateBabDokumenDto {
  @IsInt()
  @Min(1)
  urutanBab!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  judulBab!: string;
}
