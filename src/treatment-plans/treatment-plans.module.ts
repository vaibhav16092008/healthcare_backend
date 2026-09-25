import { Module } from '@nestjs/common';
import { TreatmentPlansController } from './treatment-plans.controller.js';
import { TreatmentPlansService } from './treatment-plans.service.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [AuditModule],
  controllers: [TreatmentPlansController],
  providers: [TreatmentPlansService],
})
export class TreatmentPlansModule {}
