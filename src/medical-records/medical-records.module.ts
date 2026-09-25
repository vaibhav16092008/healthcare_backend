import { Module } from '@nestjs/common';
import { MedicalRecordsService } from './medical-records.service.js';
import { 
  PatientMedicalRecordsController,
  PatientMedicalDocumentsController,
  DoctorMedicalRecordsController
} from './medical-records.controller.js';

@Module({
  controllers: [
    PatientMedicalRecordsController,
    PatientMedicalDocumentsController,
    DoctorMedicalRecordsController
  ],
  providers: [MedicalRecordsService],
})
export class MedicalRecordsModule {}
