import { Controller, Get, Post, Patch, Body, Query, UseGuards, UnauthorizedException } from '@nestjs/common';
import { DoctorsService } from './doctors.service.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { RolesGuard } from '../auth/roles/roles.guard.js';
import { Roles } from '../auth/roles/roles.decorator.js';
import { AppRole } from '../auth/roles/roles.enum.js';
import { CreateDoctorProfileDto } from './dto/create-doctor-profile.dto.js';
import { UpdateDoctorProfileDto } from './dto/update-doctor-profile.dto.js';
import { DoctorSearchQueryDto } from './dto/doctor-search-query.dto.js';

@Controller('doctors/profile')
@UseGuards(SupabaseAuthGuard)
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  private extractAppUserId(user: any): string {
    if (!user || !user.appUser || !user.appUser.id) {
      throw new UnauthorizedException('User is not fully onboarded or missing internal identity.');
    }
    return user.appUser.id;
  }

  @Post()
  async createProfile(
    @CurrentUser() user: any,
    @Body() createDoctorProfileDto: CreateDoctorProfileDto
  ) {
    const userId = this.extractAppUserId(user);
    return this.doctorsService.createProfile(userId, createDoctorProfileDto);
  }

  @Get()
  async getProfile(@CurrentUser() user: any) {
    const userId = this.extractAppUserId(user);
    return this.doctorsService.getProfile(userId);
  }

  @Patch()
  async updateProfile(
    @CurrentUser() user: any,
    @Body() updateDoctorProfileDto: UpdateDoctorProfileDto
  ) {
    const userId = this.extractAppUserId(user);
    return this.doctorsService.updateProfile(userId, updateDoctorProfileDto);
  }
}

@Controller()
export class PublicDoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Get('api/v1/doctors')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(AppRole.PATIENT)
  async searchDoctors(@Query() query: DoctorSearchQueryDto) {
    return this.doctorsService.searchDoctors(query);
  }
}
