import { Module } from '@nestjs/common';
import { ClinicalEncountersService } from './clinical-encounters.service.js';
import { ClinicalEncountersController } from './clinical-encounters.controller.js';

@Module({
  controllers: [ClinicalEncountersController],
  providers: [ClinicalEncountersService],
})
export class ClinicalEncountersModule {}
