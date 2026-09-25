import { IsString, IsEnum, IsOptional, Matches } from 'class-validator';
import { OverrideType } from './create-schedule-override.dto.js';

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD

export class UpdateScheduleOverrideDto {
  @IsOptional()
  @IsString()
  clinic_location_id?: string;

  @IsOptional()
  @IsString()
  @Matches(dateRegex, { message: 'date must be in YYYY-MM-DD format' })
  date?: string;

  @IsOptional()
  @IsEnum(OverrideType)
  type?: OverrideType;

  @IsOptional()
  @IsString()
  @Matches(timeRegex, { message: 'start_time must be in HH:mm format' })
  start_time?: string;

  @IsOptional()
  @IsString()
  @Matches(timeRegex, { message: 'end_time must be in HH:mm format' })
  end_time?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
