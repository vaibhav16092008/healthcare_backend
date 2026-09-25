import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTreatmentPlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  summary?: string;
}
