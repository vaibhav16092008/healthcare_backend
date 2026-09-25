import { IsString, IsEnum, Matches } from 'class-validator';

export enum DayOfWeek {
  MONDAY = 'MONDAY',
  TUESDAY = 'TUESDAY',
  WEDNESDAY = 'WEDNESDAY',
  THURSDAY = 'THURSDAY',
  FRIDAY = 'FRIDAY',
  SATURDAY = 'SATURDAY',
  SUNDAY = 'SUNDAY',
}

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:mm

export class CreateScheduleDto {
  @IsString()
  clinic_location_id: string;

  @IsEnum(DayOfWeek)
  day_of_week: DayOfWeek;

  @IsString()
  @Matches(timeRegex, { message: 'start_time must be in HH:mm format' })
  start_time: string;

  @IsString()
  @Matches(timeRegex, { message: 'end_time must be in HH:mm format' })
  end_time: string;
}
