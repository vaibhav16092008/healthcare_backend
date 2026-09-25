import { Module } from '@nestjs/common';
import { ClinicalNotesController } from './clinical-notes.controller.js';
import { ClinicalNotesService } from './clinical-notes.service.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [AuditModule],
  controllers: [ClinicalNotesController],
  providers: [ClinicalNotesService],
})
export class ClinicalNotesModule {}
