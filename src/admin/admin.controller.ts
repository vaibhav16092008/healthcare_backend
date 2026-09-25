import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { RolesGuard } from '../auth/roles/roles.guard.js';
import { Roles } from '../auth/roles/roles.decorator.js';
import { AppRole } from '../auth/roles/roles.enum.js';
import { UpdateDoctorVerificationDto } from './dto/update-doctor-verification.dto.js';

@Controller('admin')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(AppRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('doctors/pending')
  getPendingDoctors() {
    return this.adminService.getPendingDoctors();
  }

  @Get('doctors/:id')
  getDoctorById(@Param('id') id: string) {
    return this.adminService.getDoctorById(id);
  }

  @Patch('doctors/:id/verification')
  updateDoctorVerification(
    @Param('id') id: string,
    @Body() updateDto: UpdateDoctorVerificationDto
  ) {
    return this.adminService.updateDoctorVerification(id, updateDto);
  }
}
