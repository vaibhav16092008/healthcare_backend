import { IsString, IsInt, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class CreateDoctorProfileDto {
  @IsString()
  specialization: string;

  @IsInt()
  @Min(0)
  @Max(100)
  experience_years: number;

  @IsString()
  registration_number: string;

  @IsString()
  medical_council_name: string;

  @IsInt()
  @Min(1900)
  @Max(new Date().getFullYear())
  registration_year: number;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  consultation_fee?: number;
}
