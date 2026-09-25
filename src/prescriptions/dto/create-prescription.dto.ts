import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePrescriptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
