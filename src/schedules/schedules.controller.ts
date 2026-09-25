import { Controller, Post, Get, Patch, Delete, Param, Body, UseGuards, Query, UnauthorizedException } from '@nestjs/common';
import { SchedulesService } from './schedules.service.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { RolesGuard } from '../auth/roles/roles.guard.js';
import { Roles } from '../auth/roles/roles.decorator.js';
import { AppRole } from '../auth/roles/roles.enum.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { CreateScheduleDto } from './dto/create-schedule.dto.js';
import { UpdateScheduleDto } from './dto/update-schedule.dto.js';
import { CreateBreakDto } from './dto/create-break.dto.js';
import { UpdateBreakDto } from './dto/update-break.dto.js';
import { CreateScheduleOverrideDto } from './dto/create-schedule-override.dto.js';
import { UpdateScheduleOverrideDto } from './dto/update-schedule-override.dto.js';

@UseGuards(SupabaseAuthGuard, RolesGuard)
@Controller('doctors/me')
@Roles(AppRole.DOCTOR)
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  private extractAppUserId(user: any): string {
    if (!user || !user.appUser || !user.appUser.id) {
      throw new UnauthorizedException('User identity missing.');
    }
    return user.appUser.id;
  }

  // ==========================
  // SCHEDULES
  // ==========================
  @Post('schedules')
  createSchedule(@CurrentUser() user: any, @Body() dto: CreateScheduleDto) {
    return this.schedulesService.createSchedule(this.extractAppUserId(user), dto);
  }

  @Get('schedules')
  getMySchedules(@CurrentUser() user: any, @Query('clinic_location_id') clinicLocationId?: string) {
    return this.schedulesService.getMySchedules(this.extractAppUserId(user), clinicLocationId);
  }

  @Get('schedules/:id')
  getScheduleById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.schedulesService.getScheduleById(this.extractAppUserId(user), id);
  }

  @Patch('schedules/:id')
  updateSchedule(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateScheduleDto) {
    return this.schedulesService.updateSchedule(this.extractAppUserId(user), id, dto);
  }

  @Delete('schedules/:id')
  deleteSchedule(@CurrentUser() user: any, @Param('id') id: string) {
    return this.schedulesService.deleteSchedule(this.extractAppUserId(user), id);
  }

  // ==========================
  // BREAKS
  // ==========================
  @Post('schedules/:id/breaks')
  createBreak(@CurrentUser() user: any, @Param('id') scheduleId: string, @Body() dto: CreateBreakDto) {
    return this.schedulesService.createBreak(this.extractAppUserId(user), scheduleId, dto);
  }

  @Get('schedules/:id/breaks/:breakId')
  getBreakById(@CurrentUser() user: any, @Param('id') scheduleId: string, @Param('breakId') breakId: string) {
    return this.schedulesService.getBreakById(this.extractAppUserId(user), scheduleId, breakId);
  }

  @Patch('schedules/:id/breaks/:breakId')
  updateBreak(@CurrentUser() user: any, @Param('id') scheduleId: string, @Param('breakId') breakId: string, @Body() dto: UpdateBreakDto) {
    return this.schedulesService.updateBreak(this.extractAppUserId(user), scheduleId, breakId, dto);
  }

  @Delete('schedules/:id/breaks/:breakId')
  deleteBreak(@CurrentUser() user: any, @Param('id') scheduleId: string, @Param('breakId') breakId: string) {
    return this.schedulesService.deleteBreak(this.extractAppUserId(user), scheduleId, breakId);
  }

  // ==========================
  // OVERRIDES
  // ==========================
  @Post('schedule-overrides')
  createOverride(@CurrentUser() user: any, @Body() dto: CreateScheduleOverrideDto) {
    return this.schedulesService.createOverride(this.extractAppUserId(user), dto);
  }

  @Get('schedule-overrides')
  getMyOverrides(@CurrentUser() user: any, @Query('clinic_location_id') clinicLocationId?: string) {
    return this.schedulesService.getMyOverrides(this.extractAppUserId(user), clinicLocationId);
  }

  @Get('schedule-overrides/:id')
  getOverrideById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.schedulesService.getOverrideById(this.extractAppUserId(user), id);
  }

  @Patch('schedule-overrides/:id')
  updateOverride(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateScheduleOverrideDto) {
    return this.schedulesService.updateOverride(this.extractAppUserId(user), id, dto);
  }

  @Delete('schedule-overrides/:id')
  deleteOverride(@CurrentUser() user: any, @Param('id') id: string) {
    return this.schedulesService.deleteOverride(this.extractAppUserId(user), id);
  }
}
