import { IsString, Matches } from 'class-validator';

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateBreakDto {
  @IsString()
  @Matches(timeRegex, { message: 'start_time must be in HH:mm format' })
  start_time: string;

  @IsString()
  @Matches(timeRegex, { message: 'end_time must be in HH:mm format' })
  end_time: string;
}
