import { Controller, Post, Get, Patch, Param, Body, UseGuards, UnauthorizedException } from '@nestjs/common';
import { ClinicalNotesService } from './clinical-notes.service.js';
import { CreateClinicalNoteDto } from './dto/create-clinical-note.dto.js';
import { UpdateClinicalNoteDto } from './dto/update-clinical-note.dto.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { RolesGuard } from '../auth/roles/roles.guard.js';
import { Roles } from '../auth/roles/roles.decorator.js';
import { AppRole } from '../auth/roles/roles.enum.js';
import { CurrentUser } from '../auth/current-user.decorator.js';

@Controller('api/v1/encounters/:encounterId/notes')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class ClinicalNotesController {
  constructor(private readonly clinicalNotesService: ClinicalNotesService) {}

  private extractAppUserId(user: any): string {
    const id = user?.user_metadata?.app_user_id || user?.app_user_id || user?.appUser?.id;
    if (!id) throw new UnauthorizedException('Unauthenticated or app_user_id missing.');
    return id;
  }

  private extractRole(user: any): string {
    return user?.user_metadata?.app_role || user?.app_role || (user?.roles && user?.roles[0]) || 'PATIENT';
  }

  @Post()
  @Roles(AppRole.DOCTOR)
  async createNote(
    @CurrentUser() user: any,
    @Param('encounterId') encounterId: string,
    @Body() dto: CreateClinicalNoteDto,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.clinicalNotesService.createNote(appUserId, encounterId, dto);
  }

  @Patch(':noteId')
  @Roles(AppRole.DOCTOR)
  async updateNote(
    @CurrentUser() user: any,
    @Param('encounterId') encounterId: string,
    @Param('noteId') noteId: string,
    @Body() dto: UpdateClinicalNoteDto,
  ) {
    const appUserId = this.extractAppUserId(user);
    return this.clinicalNotesService.updateNote(appUserId, encounterId, noteId, dto);
  }

  @Get()
  @Roles(AppRole.PATIENT, AppRole.DOCTOR)
  async getNotes(
    @CurrentUser() user: any,
    @Param('encounterId') encounterId: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    const role = this.extractRole(user);
    return this.clinicalNotesService.getNotes(appUserId, role, encounterId);
  }

  @Get(':noteId')
  @Roles(AppRole.PATIENT, AppRole.DOCTOR)
  async getNoteById(
    @CurrentUser() user: any,
    @Param('encounterId') encounterId: string,
    @Param('noteId') noteId: string,
  ) {
    const appUserId = this.extractAppUserId(user);
    const role = this.extractRole(user);
    return this.clinicalNotesService.getNoteById(appUserId, role, encounterId, noteId);
  }
}
