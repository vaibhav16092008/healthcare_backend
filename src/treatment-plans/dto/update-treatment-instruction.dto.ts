import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { TreatmentInstructionType, TreatmentInstructionPriority } from '@prisma/client';

export class UpdateTreatmentInstructionDto {
  @IsOptional()
  @IsEnum(TreatmentInstructionType)
  instruction_type?: TreatmentInstructionType;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  instruction_text?: string;

  @IsOptional()
  @IsEnum(TreatmentInstructionPriority)
  priority?: TreatmentInstructionPriority;
}
