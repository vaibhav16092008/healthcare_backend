import { Controller, Post, Get, Patch, Param, Body, UseGuards, UnauthorizedException } from '@nestjs/common';
import { ClinicalDiagnosesService } from './clinical-diagnoses.service.js';
import { CreateClinicalDiagnosisDto } from './dto/create-clinical-diagnosis.dto.js';
import { UpdateClinicalDiagnosisDto } from './dto/update-clinical-diagnosis.dto.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { RolesGuard } from '../auth/roles/roles.guard.js';
import { Roles } from '../auth/roles/roles.decorator.js';
import { AppRole } from '../auth/roles/roles.enum.js';
import { CurrentUser } from '../auth/current-user.decorator.js';

@Controller('api/v1/encounters/:encounterId/diagnoses')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class ClinicalDiagnosesController {
  constructor(private readonly clinicalDiagnosesService: ClinicalDiagnosesService) {}

  private extractAppUserId(user: any): string {
    const id = user?.user_metadata?.app_user_id || user?.app_user_id;
    if (!id) throw new UnauthorizedException('Unauthenticated or app_user_id missing.');
    return id;
  }

  @Post()
  @Roles(AppRole.DOCTOR)
  async createDiagnosis(
    @CurrentUser() user: any,
    @Param('encounterId') encounterId: string,
    @Body() dto: CreateClinicalDiagnosisDto,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.clinicalDiagnosesService.createDiagnosis(appUserId, encounterId, dto);
  }

  @Patch(':diagnosisId')
  @Roles(AppRole.DOCTOR)
  async updateDiagnosis(
    @CurrentUser() user: any,
    @Param('encounterId') encounterId: string,
    @Param('diagnosisId') diagnosisId: string,
    @Body() dto: UpdateClinicalDiagnosisDto,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.clinicalDiagnosesService.updateDiagnosis(appUserId, encounterId, diagnosisId, dto);
  }

  @Post(':diagnosisId/resolve')
  @Roles(AppRole.DOCTOR)
  async resolveDiagnosis(
    @CurrentUser() user: any,
    @Param('encounterId') encounterId: string,
    @Param('diagnosisId') diagnosisId: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.clinicalDiagnosesService.resolveDiagnosis(appUserId, encounterId, diagnosisId);
  }

  @Get()
  @Roles(AppRole.PATIENT, AppRole.DOCTOR)
  async getDiagnoses(
    @CurrentUser() user: any,
    @Param('encounterId') encounterId: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    const role = user?.user_metadata?.app_role || user?.app_role;
    return this.clinicalDiagnosesService.getDiagnoses(appUserId, role, encounterId);
  }

  @Get(':diagnosisId')
  @Roles(AppRole.PATIENT, AppRole.DOCTOR)
  async getDiagnosisById(
    @CurrentUser() user: any,
    @Param('encounterId') encounterId: string,
    @Param('diagnosisId') diagnosisId: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    const role = user?.user_metadata?.app_role || user?.app_role;
    return this.clinicalDiagnosesService.getDiagnosisById(appUserId, role, encounterId, diagnosisId);
  }
}
