import { IsEnum } from 'class-validator';

export enum VerificationStatus {
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

export class UpdateDoctorVerificationDto {
  @IsEnum(VerificationStatus)
  status: VerificationStatus;
}
