import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateLabResultItemDto {
  @IsUUID()
  @IsNotEmpty()
  lab_order_item_id: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  result_value?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference_range?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  qualitative_result?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
