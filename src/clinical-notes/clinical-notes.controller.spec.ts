import { Test, TestingModule } from '@nestjs/testing';
import { ClinicalNotesController } from './clinical-notes.controller.js';
import { ClinicalNotesService } from './clinical-notes.service.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { RolesGuard } from '../auth/roles/roles.guard.js';
import { vi } from 'vitest';
import { ClinicalNoteType } from '@prisma/client';

describe('ClinicalNotesController', () => {
  let controller: ClinicalNotesController;
  let service: ClinicalNotesService;

  beforeEach(async () => {
    const mockService = {
      createNote: vi.fn(),
      updateNote: vi.fn(),
      getNotes: vi.fn(),
      getNoteById: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClinicalNotesController],
      providers: [
        { provide: ClinicalNotesService, useValue: mockService },
      ],
    })
      .overrideGuard(SupabaseAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ClinicalNotesController>(ClinicalNotesController);
    service = module.get<ClinicalNotesService>(ClinicalNotesService);
  });

  const mockUser = (id: string, role: string) => ({
    app_user_id: id,
    app_role: role,
  });

  describe('createNote', () => {
    it('calls service createNote', async () => {
      const dto = { note_type: ClinicalNoteType.CONSULTATION, subjective: 'Subj' };
      await controller.createNote(mockUser('doc-1', 'DOCTOR'), 'e-1', dto);
      expect(service.createNote).toHaveBeenCalledWith('doc-1', 'e-1', dto);
    });
  });

  describe('updateNote', () => {
    it('calls service updateNote', async () => {
      const dto = { subjective: 'Subj 2' };
      await controller.updateNote(mockUser('doc-1', 'DOCTOR'), 'e-1', 'n-1', dto);
      expect(service.updateNote).toHaveBeenCalledWith('doc-1', 'e-1', 'n-1', dto);
    });
  });

  describe('getNotes', () => {
    it('calls service getNotes', async () => {
      await controller.getNotes(mockUser('pat-1', 'PATIENT'), 'e-1');
      expect(service.getNotes).toHaveBeenCalledWith('pat-1', 'PATIENT', 'e-1');
    });
  });

  describe('getNoteById', () => {
    it('calls service getNoteById', async () => {
      await controller.getNoteById(mockUser('pat-1', 'PATIENT'), 'e-1', 'n-1');
      expect(service.getNoteById).toHaveBeenCalledWith('pat-1', 'PATIENT', 'e-1', 'n-1');
    });
  });
});
