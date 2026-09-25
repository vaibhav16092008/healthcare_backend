import { Controller, Post, Get, Patch, Delete, Param, Body, UseGuards, UnauthorizedException } from '@nestjs/common';
import { ClinicsService } from './clinics.service.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { RolesGuard } from '../auth/roles/roles.guard.js';
import { Roles } from '../auth/roles/roles.decorator.js';
import { AppRole } from '../auth/roles/roles.enum.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { CreateClinicDto, UpdateClinicDto } from './dto/clinic.dto.js';
import { CreateClinicLocationDto, UpdateClinicLocationDto } from './dto/clinic-location.dto.js';
import { CreateDoctorClinicDto } from './dto/doctor-clinic.dto.js';

@UseGuards(SupabaseAuthGuard, RolesGuard)
@Controller()
export class ClinicsController {
  constructor(private readonly clinicsService: ClinicsService) {}

  private extractAppUserId(user: any): string {
    if (!user || !user.appUser || !user.appUser.id) {
      throw new UnauthorizedException('User identity missing.');
    }
    return user.appUser.id;
  }

  // ==========================================
  // CLINIC ENDPOINTS
  // ==========================================
  
  @Roles(AppRole.DOCTOR)
  @Post('clinics')
  createClinic(@CurrentUser() user: any, @Body() dto: CreateClinicDto) {
    return this.clinicsService.createClinic(this.extractAppUserId(user), dto);
  }

  @Get('clinics/:id')
  getClinic(@Param('id') id: string) {
    return this.clinicsService.getClinic(id);
  }

  @Roles(AppRole.DOCTOR, AppRole.ADMIN)
  @Patch('clinics/:id')
  updateClinic(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateClinicDto) {
    return this.clinicsService.updateClinic(this.extractAppUserId(user), id, dto);
  }

  // ==========================================
  // CLINIC LOCATION ENDPOINTS
  // ==========================================

  @Roles(AppRole.DOCTOR, AppRole.ADMIN)
  @Post('clinics/:id/locations')
  createLocation(@CurrentUser() user: any, @Param('id') clinicId: string, @Body() dto: CreateClinicLocationDto) {
    return this.clinicsService.createLocation(this.extractAppUserId(user), clinicId, dto);
  }

  @Get('clinics/:id/locations')
  getLocations(@Param('id') clinicId: string) {
    return this.clinicsService.getLocations(clinicId);
  }

  @Roles(AppRole.DOCTOR, AppRole.ADMIN)
  @Patch('clinics/:id/locations/:locationId')
  updateLocation(
    @CurrentUser() user: any,
    @Param('id') clinicId: string,
    @Param('locationId') locationId: string,
    @Body() dto: UpdateClinicLocationDto
  ) {
    return this.clinicsService.updateLocation(this.extractAppUserId(user), clinicId, locationId, dto);
  }

  // ==========================================
  // DOCTOR-CLINIC PRACTICE ENDPOINTS
  // ==========================================

  @Roles(AppRole.DOCTOR)
  @Get('doctors/me/clinics')
  getMyPractices(@CurrentUser() user: any) {
    return this.clinicsService.getMyPractices(this.extractAppUserId(user));
  }

  @Roles(AppRole.DOCTOR)
  @Post('doctors/me/clinics')
  addMyPractice(@CurrentUser() user: any, @Body() dto: CreateDoctorClinicDto) {
    return this.clinicsService.addMyPractice(this.extractAppUserId(user), dto);
  }

  @Roles(AppRole.DOCTOR)
  @Delete('doctors/me/clinics/:clinicId')
  removeMyPractice(@CurrentUser() user: any, @Param('clinicId') clinicId: string) {
    return this.clinicsService.removeMyPractice(this.extractAppUserId(user), clinicId);
  }
}
