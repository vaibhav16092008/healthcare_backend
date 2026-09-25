import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePrescriptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
