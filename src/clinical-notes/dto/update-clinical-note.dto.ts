import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ClinicalNoteType } from '@prisma/client';

export class UpdateClinicalNoteDto {
  @IsOptional()
  @IsEnum(ClinicalNoteType)
  note_type?: ClinicalNoteType;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  subjective?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  objective?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  clinical_observations?: string;
}
