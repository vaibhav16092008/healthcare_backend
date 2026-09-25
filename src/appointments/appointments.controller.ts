import { Controller, Post, Get, Patch, Body, Param, Query, UseGuards, UnauthorizedException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service.js';
import { CreateAppointmentDto } from './dto/create-appointment.dto.js';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto.js';
import { AvailabilityQueryDto } from './dto/availability-query.dto.js';
import { AppointmentListQueryDto } from './dto/appointment-list-query.dto.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { RolesGuard } from '../auth/roles/roles.guard.js';
import { Roles } from '../auth/roles/roles.decorator.js';
import { AppRole } from '../auth/roles/roles.enum.js';
import { CurrentUser } from '../auth/current-user.decorator.js';

import { DEFAULT_APPOINTMENT_DURATION_MINUTES } from './appointments.constants.js';

@Controller()
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  private extractAppUserId(user: any): string {
    if (!user || !user.appUser || !user.appUser.id) {
      throw new UnauthorizedException('User identity missing.');
    }
    return user.appUser.id;
  }

  private extractRole(user: any): string {
    if (!user || !user.appUser || !user.appUser.role) {
      throw new UnauthorizedException('User role missing.');
    }
    return user.appUser.role;
  }

  // ---- CREATION & AVAILABILITY ----
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(AppRole.PATIENT)
  @Post('api/v1/appointments')
  createAppointment(@CurrentUser() user: any, @Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.createAppointment(this.extractAppUserId(user), dto);
  }

  @Get('api/v1/doctors/:doctorClinicId/availability')
  getAvailability(
    @Param('doctorClinicId') doctorClinicId: string,
    @Query() query: AvailabilityQueryDto
  ) {
    return this.appointmentsService.getAvailability(doctorClinicId, query, DEFAULT_APPOINTMENT_DURATION_MINUTES);
  }

  // ---- RETRIEVAL ----
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(AppRole.PATIENT)
  @Get('api/v1/appointments/me')
  getPatientAppointments(@CurrentUser() user: any, @Query() query: AppointmentListQueryDto) {
    return this.appointmentsService.getPatientAppointments(this.extractAppUserId(user), query);
  }

  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(AppRole.DOCTOR)
  @Get('api/v1/doctors/me/appointments')
  getDoctorAppointments(@CurrentUser() user: any, @Query() query: AppointmentListQueryDto) {
    return this.appointmentsService.getDoctorAppointments(this.extractAppUserId(user), query);
  }

  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(AppRole.PATIENT, AppRole.DOCTOR)
  @Get('api/v1/appointments/:id')
  getAppointmentById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.appointmentsService.getAppointmentById(this.extractAppUserId(user), this.extractRole(user), id);
  }

  // ---- LIFECYCLE ----
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(AppRole.PATIENT, AppRole.DOCTOR)
  @Post('api/v1/appointments/:id/cancel')
  cancelAppointment(@CurrentUser() user: any, @Param('id') id: string) {
    return this.appointmentsService.cancelAppointment(this.extractAppUserId(user), this.extractRole(user), id);
  }

  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(AppRole.DOCTOR)
  @Post('api/v1/appointments/:id/complete')
  completeAppointment(@CurrentUser() user: any, @Param('id') id: string) {
    return this.appointmentsService.completeAppointment(this.extractAppUserId(user), id);
  }

  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(AppRole.DOCTOR)
  @Post('api/v1/appointments/:id/no-show')
  markNoShow(@CurrentUser() user: any, @Param('id') id: string) {
    return this.appointmentsService.markNoShow(this.extractAppUserId(user), id);
  }

  // ---- RESCHEDULE ----
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(AppRole.PATIENT)
  @Patch('api/v1/appointments/:id/reschedule')
  rescheduleAppointment(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: RescheduleAppointmentDto) {
    return this.appointmentsService.rescheduleAppointment(this.extractAppUserId(user), id, dto);
  }
}
