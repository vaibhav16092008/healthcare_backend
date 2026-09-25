import { Module } from '@nestjs/common';
import { ClinicalDiagnosesController } from './clinical-diagnoses.controller.js';
import { ClinicalDiagnosesService } from './clinical-diagnoses.service.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [AuditModule],
  controllers: [ClinicalDiagnosesController],
  providers: [ClinicalDiagnosesService],
})
export class ClinicalDiagnosesModule {}
