import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { TreatmentInstructionType, TreatmentInstructionPriority } from '@prisma/client';

export class CreateTreatmentInstructionDto {
  @IsEnum(TreatmentInstructionType)
  instruction_type: TreatmentInstructionType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  instruction_text: string;

  @IsEnum(TreatmentInstructionPriority)
  priority: TreatmentInstructionPriority;
}
