import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLabResultDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  report_notes?: string;
}
