import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLabOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  clinical_notes?: string;
}
