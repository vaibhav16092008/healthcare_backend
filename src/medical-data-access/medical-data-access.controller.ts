import { Controller, Post, Get, Param, Body, UseGuards, UnauthorizedException } from '@nestjs/common';
import { MedicalDataAccessService } from './medical-data-access.service.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { RolesGuard } from '../auth/roles/roles.guard.js';
import { Roles } from '../auth/roles/roles.decorator.js';
import { AppRole } from '../auth/roles/roles.enum.js';
import { CurrentUser } from '../auth/current-user.decorator.js';

function extractAppUserId(user: any): string {
  if (!user || !user.appUser || !user.appUser.id) {
    throw new UnauthorizedException('User is not fully onboarded or missing internal identity.');
  }
  return user.appUser.id;
}

@Controller('api/v1')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class MedicalDataAccessController {
  constructor(private readonly dataAccess: MedicalDataAccessService) {}

  @Post('patients/me/medical-access-grants')
  @Roles(AppRole.PATIENT)
  async createGrant(
    @CurrentUser() user: any,
    @Body('doctor_id') doctorId: string,
  ) {
    return this.dataAccess.createGrant(extractAppUserId(user), doctorId);
  }

  @Post('patients/me/medical-access-grants/:id/revoke')
  @Roles(AppRole.PATIENT)
  async revokeGrant(
    @CurrentUser() user: any,
    @Param('id') grantId: string,
  ) {
    return this.dataAccess.revokeGrant(extractAppUserId(user), grantId);
  }

  @Get('patients/me/medical-access-grants')
  @Roles(AppRole.PATIENT)
  async listPatientGrants(@CurrentUser() user: any) {
    const grants = await this.dataAccess.getPatientGrants(extractAppUserId(user));
    return grants.map(g => ({
      id: g.id,
      doctor_id: g.doctor_id,
      status: g.status,
      granted_at: g.granted_at,
      revoked_at: g.revoked_at,
      doctor_email: g.doctor?.user?.email, // Safe minimal info
    }));
  }

  @Get('doctors/me/medical-access-grants')
  @Roles(AppRole.DOCTOR)
  async listDoctorGrants(@CurrentUser() user: any) {
    const grants = await this.dataAccess.getDoctorGrants(extractAppUserId(user));
    return grants.map(g => ({
      id: g.id,
      patient_id: g.patient_id,
      status: g.status,
      granted_at: g.granted_at,
      revoked_at: g.revoked_at,
      patient_email: g.patient?.user?.email, // Safe minimal info
    }));
  }
}
