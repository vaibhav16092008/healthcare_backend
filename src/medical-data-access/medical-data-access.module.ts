import { Module, Global } from '@nestjs/common';
import { MedicalDataAccessService } from './medical-data-access.service.js';
import { MedicalDataAccessController } from './medical-data-access.controller.js';

@Global()
@Module({
  providers: [MedicalDataAccessService],
  controllers: [MedicalDataAccessController],
  exports: [MedicalDataAccessService],
})
export class MedicalDataAccessModule {}
