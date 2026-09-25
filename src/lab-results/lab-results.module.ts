import { Module } from '@nestjs/common';
import { LabResultsController } from './lab-results.controller.js';
import { LabResultsService } from './lab-results.service.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [AuditModule],
  controllers: [LabResultsController],
  providers: [LabResultsService],
})
export class LabResultsModule {}
