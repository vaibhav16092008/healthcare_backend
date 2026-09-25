import { Controller, Post, Get, Patch, Param, Body, UseGuards, UnauthorizedException } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service.js';
import { CreatePrescriptionDto } from './dto/create-prescription.dto.js';
import { UpdatePrescriptionDto } from './dto/update-prescription.dto.js';
import { CreatePrescriptionItemDto } from './dto/create-prescription-item.dto.js';
import { UpdatePrescriptionItemDto } from './dto/update-prescription-item.dto.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { RolesGuard } from '../auth/roles/roles.guard.js';
import { Roles } from '../auth/roles/roles.decorator.js';
import { AppRole } from '../auth/roles/roles.enum.js';
import { CurrentUser } from '../auth/current-user.decorator.js';

@Controller('api/v1')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  private extractAppUserId(user: any): string {
    const id = user?.user_metadata?.app_user_id || user?.app_user_id;
    if (!id) throw new UnauthorizedException('Unauthenticated or app_user_id missing.');
    return id;
  }

  @Post('encounters/:encounterId/prescriptions')
  @Roles(AppRole.DOCTOR)
  async createPrescription(
    @CurrentUser() user: any,
    @Param('encounterId') encounterId: string,
    @Body() dto: CreatePrescriptionDto,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.prescriptionsService.createPrescription(appUserId, encounterId, dto);
  }

  @Get('encounters/:encounterId/prescriptions')
  @Roles(AppRole.PATIENT, AppRole.DOCTOR)
  async getPrescriptionsForEncounter(
    @CurrentUser() user: any,
    @Param('encounterId') encounterId: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    const role = user?.user_metadata?.app_role || user?.app_role;
    return this.prescriptionsService.getPrescriptionsForEncounter(appUserId, role, encounterId);
  }

  @Get('prescriptions/:id')
  @Roles(AppRole.PATIENT, AppRole.DOCTOR)
  async getPrescriptionById(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    const role = user?.user_metadata?.app_role || user?.app_role;
    return this.prescriptionsService.getPrescriptionById(appUserId, role, id);
  }

  @Patch('prescriptions/:id')
  @Roles(AppRole.DOCTOR)
  async updatePrescription(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdatePrescriptionDto,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.prescriptionsService.updatePrescription(appUserId, id, dto);
  }

  @Post('prescriptions/:id/complete')
  @Roles(AppRole.DOCTOR)
  async completePrescription(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.prescriptionsService.setPrescriptionStatus(appUserId, id, 'COMPLETED');
  }

  @Post('prescriptions/:id/cancel')
  @Roles(AppRole.DOCTOR)
  async cancelPrescription(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.prescriptionsService.setPrescriptionStatus(appUserId, id, 'CANCELLED');
  }

  @Post('prescriptions/:prescriptionId/items')
  @Roles(AppRole.DOCTOR)
  async createPrescriptionItem(
    @CurrentUser() user: any,
    @Param('prescriptionId') prescriptionId: string,
    @Body() dto: CreatePrescriptionItemDto,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.prescriptionsService.createPrescriptionItem(appUserId, prescriptionId, dto);
  }

  @Get('prescriptions/:prescriptionId/items')
  @Roles(AppRole.PATIENT, AppRole.DOCTOR)
  async getPrescriptionItems(
    @CurrentUser() user: any,
    @Param('prescriptionId') prescriptionId: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    const role = user?.user_metadata?.app_role || user?.app_role;
    return this.prescriptionsService.getPrescriptionItems(appUserId, role, prescriptionId);
  }

  @Get('prescriptions/:prescriptionId/items/:itemId')
  @Roles(AppRole.PATIENT, AppRole.DOCTOR)
  async getPrescriptionItemById(
    @CurrentUser() user: any,
    @Param('prescriptionId') prescriptionId: string,
    @Param('itemId') itemId: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    const role = user?.user_metadata?.app_role || user?.app_role;
    return this.prescriptionsService.getPrescriptionItemById(appUserId, role, prescriptionId, itemId);
  }

  @Patch('prescriptions/:prescriptionId/items/:itemId')
  @Roles(AppRole.DOCTOR)
  async updatePrescriptionItem(
    @CurrentUser() user: any,
    @Param('prescriptionId') prescriptionId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdatePrescriptionItemDto,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.prescriptionsService.updatePrescriptionItem(appUserId, prescriptionId, itemId, dto);
  }
}
