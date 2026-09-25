import { Controller, Get, Post, Patch, Body, UseGuards, UnauthorizedException } from '@nestjs/common';
import { PatientsService } from './patients.service.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { CreatePatientProfileDto } from './dto/create-patient-profile.dto.js';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto.js';

@Controller('patients/profile')
@UseGuards(SupabaseAuthGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  private extractAppUserId(user: any): string {
    if (!user || !user.appUser || !user.appUser.id) {
      throw new UnauthorizedException('User is not fully onboarded or missing internal identity.');
    }
    return user.appUser.id;
  }

  @Post()
  async createProfile(
    @CurrentUser() user: any,
    @Body() createPatientProfileDto: CreatePatientProfileDto
  ) {
    const userId = this.extractAppUserId(user);
    return this.patientsService.createProfile(userId, createPatientProfileDto);
  }

  @Get()
  async getProfile(@CurrentUser() user: any) {
    const userId = this.extractAppUserId(user);
    return this.patientsService.getProfile(userId);
  }

  @Patch()
  async updateProfile(
    @CurrentUser() user: any,
    @Body() updatePatientProfileDto: UpdatePatientProfileDto
  ) {
    const userId = this.extractAppUserId(user);
    return this.patientsService.updateProfile(userId, updatePatientProfileDto);
  }
}
