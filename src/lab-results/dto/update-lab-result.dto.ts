import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateLabResultDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  report_notes?: string;
}
