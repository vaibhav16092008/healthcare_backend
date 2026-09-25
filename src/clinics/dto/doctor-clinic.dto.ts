import { IsString } from 'class-validator';

export class CreateDoctorClinicDto {
  @IsString()
  clinic_id: string;
}
