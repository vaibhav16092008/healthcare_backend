import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller.js';
import { AppointmentsService } from './appointments.service.js';
import { AvailabilityService } from './availability.service.js';

@Module({
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AvailabilityService],
})
export class AppointmentsModule {}
