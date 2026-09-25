import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ClinicalDiagnosisType } from '@prisma/client';

export class CreateClinicalDiagnosisDto {
  @IsEnum(ClinicalDiagnosisType)
  diagnosis_type: ClinicalDiagnosisType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  diagnosis_name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  diagnosis_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  diagnosis_code_system?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  clinical_description?: string;
}
