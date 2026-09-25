import { Controller, Post, Get, Param, UseGuards, ConflictException } from '@nestjs/common';
import { ClinicalEncountersService } from './clinical-encounters.service.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { RolesGuard } from '../auth/roles/roles.guard.js';
import { Roles } from '../auth/roles/roles.decorator.js';
import { AppRole } from '../auth/roles/roles.enum.js';
import { CurrentUser } from '../auth/current-user.decorator.js';

@Controller('api/v1')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class ClinicalEncountersController {
  constructor(private readonly service: ClinicalEncountersService) {}

  @Post('appointments/:appointmentId/encounter')
  @Roles(AppRole.DOCTOR)
  async createEncounter(
    @Param('appointmentId') appointmentId: string,
    @CurrentUser() user: any,
  ) {
    const doctorUserId = user.appUser.id;
    return this.service.createEncounter(doctorUserId, appointmentId);
  }

  @Post('encounters/:id/start')
  @Roles(AppRole.DOCTOR)
  async startEncounter(
    @Param('id') encounterId: string,
    @CurrentUser() user: any,
  ) {
    const doctorUserId = user.appUser.id;
    return this.service.startEncounter(doctorUserId, encounterId);
  }

  @Post('encounters/:id/complete')
  @Roles(AppRole.DOCTOR)
  async completeEncounter(
    @Param('id') encounterId: string,
    @CurrentUser() user: any,
  ) {
    const doctorUserId = user.appUser.id;
    return this.service.completeEncounter(doctorUserId, encounterId);
  }

  @Post('encounters/:id/cancel')
  @Roles(AppRole.DOCTOR)
  async cancelEncounter(
    @Param('id') encounterId: string,
    @CurrentUser() user: any,
  ) {
    const doctorUserId = user.appUser.id;
    return this.service.cancelEncounter(doctorUserId, encounterId);
  }

  @Get('encounters/:id')
  @Roles(AppRole.PATIENT, AppRole.DOCTOR)
  async getEncounter(
    @Param('id') encounterId: string,
    @CurrentUser() user: any,
  ) {
    const appUserId = user.appUser.id;
    const role = user.appUser.role;
    return this.service.getEncounter(appUserId, role, encounterId);
  }

  @Get('appointments/:appointmentId/encounter')
  @Roles(AppRole.PATIENT, AppRole.DOCTOR)
  async getEncounterByAppointment(
    @Param('appointmentId') appointmentId: string,
    @CurrentUser() user: any,
  ) {
    const appUserId = user.appUser.id;
    const role = user.appUser.role;
    return this.service.getEncounterByAppointment(appUserId, role, appointmentId);
  }
}
