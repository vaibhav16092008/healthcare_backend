import { Module } from '@nestjs/common';
import { DoctorsController, PublicDoctorsController } from './doctors.controller.js';
import { DoctorsService } from './doctors.service.js';

@Module({
  controllers: [DoctorsController, PublicDoctorsController],
  providers: [DoctorsService],
})
export class DoctorsModule {}
