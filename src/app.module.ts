import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { PatientsModule } from './patients/patients.module.js';
import { DoctorsModule } from './doctors/doctors.module.js';
import { AdminModule } from './admin/admin.module.js';
import { ClinicsModule } from './clinics/clinics.module.js';
import { SchedulesModule } from './schedules/schedules.module.js';
import { AppointmentsModule } from './appointments/appointments.module.js';
import { StorageModule } from './storage/storage.module.js';
import { MedicalRecordsModule } from './medical-records/medical-records.module.js';
import { AuditModule } from './audit/audit.module.js';
import { MedicalDataAccessModule } from './medical-data-access/medical-data-access.module.js';
import { ClinicalEncountersModule } from './clinical-encounters/clinical-encounters.module.js';
import { ClinicalNotesModule } from './clinical-notes/clinical-notes.module.js';
import { ClinicalDiagnosesModule } from './clinical-diagnoses/clinical-diagnoses.module.js';
import { TreatmentPlansModule } from './treatment-plans/treatment-plans.module.js';
import { PrescriptionsModule } from './prescriptions/prescriptions.module.js';
import { LabOrdersModule } from './lab-orders/lab-orders.module.js';
import { LabResultsModule } from './lab-results/lab-results.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    HealthModule,
    PrismaModule,
    AuthModule,
    PatientsModule,
    DoctorsModule,
    AdminModule,
    ClinicsModule,
    SchedulesModule,
    AppointmentsModule,
    StorageModule,
    AuditModule,
    MedicalDataAccessModule,
    MedicalRecordsModule,
    ClinicalEncountersModule,
    ClinicalNotesModule,
    ClinicalDiagnosesModule,
    TreatmentPlansModule,
    PrescriptionsModule,
    LabOrdersModule,
    LabResultsModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
