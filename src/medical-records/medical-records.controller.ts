import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, UnauthorizedException, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { MedicalRecordsService } from './medical-records.service.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { RolesGuard } from '../auth/roles/roles.guard.js';
import { Roles } from '../auth/roles/roles.decorator.js';
import { AppRole } from '../auth/roles/roles.enum.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { CreateMedicalRecordDto } from './dto/create-medical-record.dto.js';
import { UpdateMedicalRecordDto } from './dto/update-medical-record.dto.js';
import { CreateMedicalDocumentUploadUrlDto } from './dto/create-medical-document-upload-url.dto.js';

function extractAppUserId(user: any): string {
  if (!user || !user.appUser || !user.appUser.id) {
    throw new UnauthorizedException('User is not fully onboarded or missing internal identity.');
  }
  return user.appUser.id;
}

@Controller('api/v1/medical-records')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(AppRole.PATIENT)
export class PatientMedicalRecordsController {
  constructor(private readonly service: MedicalRecordsService) {}

  @Post()
  async createRecord(
    @CurrentUser() user: any,
    @Body() dto: CreateMedicalRecordDto
  ) {
    return this.service.createRecord(extractAppUserId(user), dto);
  }

  @Get()
  async getRecords(
    @CurrentUser() user: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number
  ) {
    return this.service.getRecords(extractAppUserId(user), page, limit);
  }

  @Get(':id')
  async getRecordById(
    @CurrentUser() user: any,
    @Param('id') id: string
  ) {
    return this.service.getRecordById(extractAppUserId(user), id);
  }

  @Patch(':id')
  async updateRecord(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateMedicalRecordDto
  ) {
    return this.service.updateRecord(extractAppUserId(user), id, dto);
  }

  @Delete(':id')
  async deleteRecord(
    @CurrentUser() user: any,
    @Param('id') id: string
  ) {
    return this.service.deleteRecord(extractAppUserId(user), id);
  }

  @Get(':id/documents')
  async getDocuments(
    @CurrentUser() user: any,
    @Param('id') recordId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number
  ) {
    return this.service.getDocuments(extractAppUserId(user), recordId, page, limit);
  }

  @Post(':id/documents/upload-url')
  async createDocumentUploadUrl(
    @CurrentUser() user: any,
    @Param('id') recordId: string,
    @Body() dto: CreateMedicalDocumentUploadUrlDto
  ) {
    return this.service.createDocumentUploadUrl(extractAppUserId(user), recordId, dto);
  }
}

@Controller('api/v1/medical-documents')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(AppRole.PATIENT)
export class PatientMedicalDocumentsController {
  constructor(private readonly service: MedicalRecordsService) {}

  @Post(':id/complete-upload')
  async completeUpload(
    @CurrentUser() user: any,
    @Param('id') documentId: string
  ) {
    return this.service.completeDocumentUpload(extractAppUserId(user), documentId);
  }

  @Get(':id/download-url')
  async getDownloadUrl(
    @CurrentUser() user: any,
    @Param('id') documentId: string
  ) {
    return this.service.getDownloadUrlForPatient(extractAppUserId(user), documentId);
  }

  @Delete(':id')
  async deleteDocument(
    @CurrentUser() user: any,
    @Param('id') documentId: string
  ) {
    return this.service.deleteDocument(extractAppUserId(user), documentId);
  }
}

@Controller('api/v1/patients/:patientId')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(AppRole.DOCTOR)
export class DoctorMedicalRecordsController {
  constructor(private readonly service: MedicalRecordsService) {}

  @Get('medical-records')
  async getRecordsForDoctor(
    @CurrentUser() user: any,
    @Param('patientId') patientId: string, // NOTE: Patient's internal user ID
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number
  ) {
    return this.service.getRecordsForDoctor(extractAppUserId(user), patientId, page, limit);
  }

  @Get('medical-records/:recordId/documents')
  async getDocumentsForDoctor(
    @CurrentUser() user: any,
    @Param('patientId') patientId: string,
    @Param('recordId') recordId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number
  ) {
    return this.service.getDocumentsForDoctor(extractAppUserId(user), patientId, recordId, page, limit);
  }

  @Get('medical-documents/:documentId/download-url')
  async getDownloadUrlForDoctor(
    @CurrentUser() user: any,
    @Param('patientId') patientId: string,
    @Param('documentId') documentId: string
  ) {
    return this.service.getDownloadUrlForDoctor(extractAppUserId(user), patientId, documentId);
  }
}
