import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreatePrescriptionItemDto {
  @IsUUID()
  @IsNotEmpty()
  medication_id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  dosage: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  frequency: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  route?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  duration?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  quantity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;
}
