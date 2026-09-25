import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateLabOrderItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;
}
