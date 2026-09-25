import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateLabOrderItemDto {
  @IsUUID()
  @IsNotEmpty()
  lab_test_id: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;
}
