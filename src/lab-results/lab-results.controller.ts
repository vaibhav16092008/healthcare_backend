import { Controller, Post, Get, Patch, Param, Body, UseGuards, UnauthorizedException } from '@nestjs/common';
import { LabResultsService } from './lab-results.service.js';
import { CreateLabResultDto } from './dto/create-lab-result.dto.js';
import { CreateLabResultItemDto } from './dto/create-lab-result-item.dto.js';
import { UpdateLabResultItemDto } from './dto/update-lab-result-item.dto.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { RolesGuard } from '../auth/roles/roles.guard.js';
import { Roles } from '../auth/roles/roles.decorator.js';
import { AppRole } from '../auth/roles/roles.enum.js';
import { CurrentUser } from '../auth/current-user.decorator.js';

@Controller('api/v1')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class LabResultsController {
  constructor(private readonly labResultsService: LabResultsService) {}

  private extractAppUserId(user: any): string {
    const id = user?.user_metadata?.app_user_id || user?.app_user_id || user?.appUser?.id;
    if (!id) throw new UnauthorizedException('Unauthenticated or app_user_id missing.');
    return id;
  }

  private extractRole(user: any): string {
    return user?.user_metadata?.app_role || user?.app_role || (user?.roles && user?.roles[0]) || 'PATIENT';
  }

  @Post('lab-orders/:labOrderId/results')
  @Roles(AppRole.DOCTOR)
  async createLabResult(
    @CurrentUser() user: any,
    @Param('labOrderId') labOrderId: string,
    @Body() dto: CreateLabResultDto,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.labResultsService.createLabResult(appUserId, labOrderId, dto);
  }

  @Get('lab-orders/:labOrderId/results')
  @Roles(AppRole.PATIENT, AppRole.DOCTOR)
  async getLabResultsForOrder(
    @CurrentUser() user: any,
    @Param('labOrderId') labOrderId: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    const role = this.extractRole(user);
    return this.labResultsService.getLabResultsForOrder(appUserId, role, labOrderId);
  }

  @Get('lab-results/:id')
  @Roles(AppRole.PATIENT, AppRole.DOCTOR)
  async getLabResultById(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    const role = this.extractRole(user);
    return this.labResultsService.getLabResultById(appUserId, role, id);
  }

  @Post('lab-results/:id/finalize')
  @Roles(AppRole.DOCTOR)
  async finalizeLabResult(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.labResultsService.finalizeLabResult(appUserId, id);
  }

  @Post('lab-results/:id/amend')
  @Roles(AppRole.DOCTOR)
  async amendLabResult(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.labResultsService.amendLabResult(appUserId, id);
  }

  @Post('lab-results/:id/cancel')
  @Roles(AppRole.DOCTOR)
  async cancelLabResult(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.labResultsService.cancelLabResult(appUserId, id);
  }

  @Post('lab-results/:labResultId/items')
  @Roles(AppRole.DOCTOR)
  async createLabResultItem(
    @CurrentUser() user: any,
    @Param('labResultId') labResultId: string,
    @Body() dto: CreateLabResultItemDto,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.labResultsService.createLabResultItem(appUserId, labResultId, dto);
  }

  @Get('lab-results/:labResultId/items')
  @Roles(AppRole.PATIENT, AppRole.DOCTOR)
  async getLabResultItems(
    @CurrentUser() user: any,
    @Param('labResultId') labResultId: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    const role = this.extractRole(user);
    return this.labResultsService.getLabResultItems(appUserId, role, labResultId);
  }

  @Get('lab-results/:labResultId/items/:itemId')
  @Roles(AppRole.PATIENT, AppRole.DOCTOR)
  async getLabResultItemById(
    @CurrentUser() user: any,
    @Param('labResultId') labResultId: string,
    @Param('itemId') itemId: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    const role = this.extractRole(user);
    return this.labResultsService.getLabResultItemById(appUserId, role, labResultId, itemId);
  }

  @Patch('lab-results/:labResultId/items/:itemId')
  @Roles(AppRole.DOCTOR)
  async updateLabResultItem(
    @CurrentUser() user: any,
    @Param('labResultId') labResultId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateLabResultItemDto,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.labResultsService.updateLabResultItem(appUserId, labResultId, itemId, dto);
  }
}
