import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateLabOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  clinical_notes?: string;
}
