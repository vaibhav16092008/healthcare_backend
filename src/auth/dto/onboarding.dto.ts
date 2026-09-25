import { IsEmail, IsOptional, IsString } from 'class-validator';

export class OnboardingDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
