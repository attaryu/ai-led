import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBabDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;
}
