import { IsString, IsEnum, IsOptional, Matches } from 'class-validator';
import { DayOfWeek } from './create-schedule.dto.js';

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:mm

export class UpdateScheduleDto {
  @IsOptional()
  @IsString()
  clinic_location_id?: string;

  @IsOptional()
  @IsEnum(DayOfWeek)
  day_of_week?: DayOfWeek;

  @IsOptional()
  @IsString()
  @Matches(timeRegex, { message: 'start_time must be in HH:mm format' })
  start_time?: string;

  @IsOptional()
  @IsString()
  @Matches(timeRegex, { message: 'end_time must be in HH:mm format' })
  end_time?: string;
}
