import { Controller, Post, Get, Patch, Param, Body, UseGuards, UnauthorizedException } from '@nestjs/common';
import { TreatmentPlansService } from './treatment-plans.service.js';
import { CreateTreatmentPlanDto } from './dto/create-treatment-plan.dto.js';
import { UpdateTreatmentPlanDto } from './dto/update-treatment-plan.dto.js';
import { CreateTreatmentInstructionDto } from './dto/create-treatment-instruction.dto.js';
import { UpdateTreatmentInstructionDto } from './dto/update-treatment-instruction.dto.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { RolesGuard } from '../auth/roles/roles.guard.js';
import { Roles } from '../auth/roles/roles.decorator.js';
import { AppRole } from '../auth/roles/roles.enum.js';
import { CurrentUser } from '../auth/current-user.decorator.js';

@Controller('api/v1/encounters/:encounterId/treatment-plan')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class TreatmentPlansController {
  constructor(private readonly treatmentPlansService: TreatmentPlansService) {}

  private extractAppUserId(user: any): string {
    const id = user?.user_metadata?.app_user_id || user?.app_user_id || user?.appUser?.id;
    if (!id) throw new UnauthorizedException('Unauthenticated or app_user_id missing.');
    return id;
  }

  private extractRole(user: any): string {
    return user?.user_metadata?.app_role || user?.app_role || (user?.roles && user?.roles[0]) || 'PATIENT';
  }

  @Post()
  @Roles(AppRole.DOCTOR)
  async createPlan(
    @CurrentUser() user: any,
    @Param('encounterId') encounterId: string,
    @Body() dto: CreateTreatmentPlanDto,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.treatmentPlansService.createPlan(appUserId, encounterId, dto);
  }

  @Get()
  @Roles(AppRole.PATIENT, AppRole.DOCTOR)
  async getPlan(
    @CurrentUser() user: any,
    @Param('encounterId') encounterId: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    const role = this.extractRole(user);
    return this.treatmentPlansService.getPlan(appUserId, role, encounterId);
  }

  @Patch()
  @Roles(AppRole.DOCTOR)
  async updatePlan(
    @CurrentUser() user: any,
    @Param('encounterId') encounterId: string,
    @Body() dto: UpdateTreatmentPlanDto,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.treatmentPlansService.updatePlan(appUserId, encounterId, dto);
  }

  @Post('complete')
  @Roles(AppRole.DOCTOR)
  async completePlan(
    @CurrentUser() user: any,
    @Param('encounterId') encounterId: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.treatmentPlansService.setPlanStatus(appUserId, encounterId, 'COMPLETED');
  }

  @Post('cancel')
  @Roles(AppRole.DOCTOR)
  async cancelPlan(
    @CurrentUser() user: any,
    @Param('encounterId') encounterId: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.treatmentPlansService.setPlanStatus(appUserId, encounterId, 'CANCELLED');
  }

  @Post('instructions')
  @Roles(AppRole.DOCTOR)
  async createInstruction(
    @CurrentUser() user: any,
    @Param('encounterId') encounterId: string,
    @Body() dto: CreateTreatmentInstructionDto,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.treatmentPlansService.createInstruction(appUserId, encounterId, dto);
  }

  @Get('instructions')
  @Roles(AppRole.PATIENT, AppRole.DOCTOR)
  async getInstructions(
    @CurrentUser() user: any,
    @Param('encounterId') encounterId: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    const role = this.extractRole(user);
    return this.treatmentPlansService.getInstructions(appUserId, role, encounterId);
  }

  @Get('instructions/:instructionId')
  @Roles(AppRole.PATIENT, AppRole.DOCTOR)
  async getInstructionById(
    @CurrentUser() user: any,
    @Param('encounterId') encounterId: string,
    @Param('instructionId') instructionId: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    const role = this.extractRole(user);
    return this.treatmentPlansService.getInstructionById(appUserId, role, encounterId, instructionId);
  }

  @Patch('instructions/:instructionId')
  @Roles(AppRole.DOCTOR)
  async updateInstruction(
    @CurrentUser() user: any,
    @Param('encounterId') encounterId: string,
    @Param('instructionId') instructionId: string,
    @Body() dto: UpdateTreatmentInstructionDto,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.treatmentPlansService.updateInstruction(appUserId, encounterId, instructionId, dto);
  }
}
