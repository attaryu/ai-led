import { IsInt, IsNotEmpty, IsString, Min, MaxLength } from 'class-validator';

export class CreateBabDokumenDto {
  @IsInt()
  @Min(1)
  chapterOrder!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  chapterTitle!: string;
}
