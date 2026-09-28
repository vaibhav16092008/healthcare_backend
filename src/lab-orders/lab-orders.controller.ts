import { Controller, Post, Get, Patch, Param, Body, UseGuards, UnauthorizedException } from '@nestjs/common';
import { LabOrdersService } from './lab-orders.service.js';
import { CreateLabOrderDto } from './dto/create-lab-order.dto.js';
import { UpdateLabOrderDto } from './dto/update-lab-order.dto.js';
import { CreateLabOrderItemDto } from './dto/create-lab-order-item.dto.js';
import { UpdateLabOrderItemDto } from './dto/update-lab-order-item.dto.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { RolesGuard } from '../auth/roles/roles.guard.js';
import { Roles } from '../auth/roles/roles.decorator.js';
import { AppRole } from '../auth/roles/roles.enum.js';
import { CurrentUser } from '../auth/current-user.decorator.js';

@Controller('api/v1')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class LabOrdersController {
  constructor(private readonly labOrdersService: LabOrdersService) {}

  private extractAppUserId(user: any): string {
    const id = user?.user_metadata?.app_user_id || user?.app_user_id || user?.appUser?.id;
    if (!id) throw new UnauthorizedException('Unauthenticated or app_user_id missing.');
    return id;
  }

  private extractRole(user: any): string {
    return user?.user_metadata?.app_role || user?.app_role || (user?.roles && user?.roles[0]) || 'PATIENT';
  }

  @Post('encounters/:encounterId/lab-orders')
  @Roles(AppRole.DOCTOR)
  async createLabOrder(
    @CurrentUser() user: any,
    @Param('encounterId') encounterId: string,
    @Body() dto: CreateLabOrderDto,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.labOrdersService.createLabOrder(appUserId, encounterId, dto);
  }

  @Get('encounters/:encounterId/lab-orders')
  @Roles(AppRole.PATIENT, AppRole.DOCTOR)
  async getLabOrdersForEncounter(
    @CurrentUser() user: any,
    @Param('encounterId') encounterId: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    const role = this.extractRole(user);
    return this.labOrdersService.getLabOrdersForEncounter(appUserId, role, encounterId);
  }

  @Get('lab-orders/:id')
  @Roles(AppRole.PATIENT, AppRole.DOCTOR)
  async getLabOrderById(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    const role = this.extractRole(user);
    return this.labOrdersService.getLabOrderById(appUserId, role, id);
  }

  @Patch('lab-orders/:id')
  @Roles(AppRole.DOCTOR)
  async updateLabOrder(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateLabOrderDto,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.labOrdersService.updateLabOrder(appUserId, id, dto);
  }

  @Post('lab-orders/:id/complete')
  @Roles(AppRole.DOCTOR)
  async completeLabOrder(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.labOrdersService.setLabOrderStatus(appUserId, id, 'COMPLETED');
  }

  @Post('lab-orders/:id/cancel')
  @Roles(AppRole.DOCTOR)
  async cancelLabOrder(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.labOrdersService.setLabOrderStatus(appUserId, id, 'CANCELLED');
  }

  @Post('lab-orders/:labOrderId/items')
  @Roles(AppRole.DOCTOR)
  async createLabOrderItem(
    @CurrentUser() user: any,
    @Param('labOrderId') labOrderId: string,
    @Body() dto: CreateLabOrderItemDto,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.labOrdersService.createLabOrderItem(appUserId, labOrderId, dto);
  }

  @Get('lab-orders/:labOrderId/items')
  @Roles(AppRole.PATIENT, AppRole.DOCTOR)
  async getLabOrderItems(
    @CurrentUser() user: any,
    @Param('labOrderId') labOrderId: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    const role = this.extractRole(user);
    return this.labOrdersService.getLabOrderItems(appUserId, role, labOrderId);
  }

  @Get('lab-orders/:labOrderId/items/:itemId')
  @Roles(AppRole.PATIENT, AppRole.DOCTOR)
  async getLabOrderItemById(
    @CurrentUser() user: any,
    @Param('labOrderId') labOrderId: string,
    @Param('itemId') itemId: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    const role = this.extractRole(user);
    return this.labOrdersService.getLabOrderItemById(appUserId, role, labOrderId, itemId);
  }

  @Patch('lab-orders/:labOrderId/items/:itemId')
  @Roles(AppRole.DOCTOR)
  async updateLabOrderItem(
    @CurrentUser() user: any,
    @Param('labOrderId') labOrderId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateLabOrderItemDto,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.labOrdersService.updateLabOrderItem(appUserId, labOrderId, itemId, dto);
  }
}
