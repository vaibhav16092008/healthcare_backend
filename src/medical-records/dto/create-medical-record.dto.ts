import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateMedicalRecordDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
