import { Module } from '@nestjs/common';
import { LabOrdersController } from './lab-orders.controller.js';
import { LabOrdersService } from './lab-orders.service.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [AuditModule],
  controllers: [LabOrdersController],
  providers: [LabOrdersService],
})
export class LabOrdersModule {}
