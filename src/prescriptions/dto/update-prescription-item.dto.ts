import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePrescriptionItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  dosage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  frequency?: string;

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
