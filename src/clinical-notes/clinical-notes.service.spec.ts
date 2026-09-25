import { Test, TestingModule } from '@nestjs/testing';
import { ClinicalNotesService } from './clinical-notes.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { AppRole } from '../auth/roles/roles.enum.js';
import { Prisma, ClinicalNoteType } from '@prisma/client';
import { vi } from 'vitest';

describe('ClinicalNotesService', () => {
  let service: ClinicalNotesService;
  let mockPrisma: any;
  let mockAudit: any;

  beforeEach(async () => {
    mockPrisma = {
      doctor: { findUnique: vi.fn() },
      clinicalEncounter: { findUnique: vi.fn() },
      clinicalNote: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => {
        return cb(mockPrisma);
      }),
    };

    mockAudit = {
      logEvent: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClinicalNotesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<ClinicalNotesService>(ClinicalNotesService);
  });

  const setupDoctor = (isVerified = true) => {
    mockPrisma.doctor.findUnique.mockResolvedValue({
      id: 'd-1',
      user_id: 'doc-user-1',
      verification_status: isVerified ? 'VERIFIED' : 'PENDING',
    });
  };

  describe('createNote', () => {
    it('throws if doctor is not verified', async () => {
      setupDoctor(false);
      await expect(
        service.createNote('doc-user-1', 'e-1', { note_type: ClinicalNoteType.CONSULTATION, subjective: 'Subj' })
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException if all clinical texts are missing', async () => {
      setupDoctor(true);
      await expect(
        service.createNote('doc-user-1', 'e-1', { note_type: ClinicalNoteType.CONSULTATION })
      ).rejects.toThrow(BadRequestException);
    });

    it('throws if encounter not found', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue(null);
      await expect(
        service.createNote('doc-user-1', 'e-1', { note_type: ClinicalNoteType.CONSULTATION, subjective: 'Subj' })
      ).rejects.toThrow(NotFoundException);
    });

    it('throws if encounter belongs to another doctor', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        doctor_id: 'd-2', // different doctor
      });
      await expect(
        service.createNote('doc-user-1', 'e-1', { note_type: ClinicalNoteType.CONSULTATION, subjective: 'Subj' })
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws if encounter is COMPLETED', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        doctor_id: 'd-1',
        status: 'COMPLETED',
      });
      await expect(
        service.createNote('doc-user-1', 'e-1', { note_type: ClinicalNoteType.CONSULTATION, subjective: 'Subj' })
      ).rejects.toThrow(ConflictException);
    });

    it('creates note successfully', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        doctor_id: 'd-1',
        patient_id: 'p-1',
        status: 'OPEN',
      });
      mockPrisma.clinicalNote.create.mockResolvedValue({
        id: 'n-1',
      });

      const res = await service.createNote('doc-user-1', 'e-1', { note_type: ClinicalNoteType.CONSULTATION, subjective: 'Subj' });
      expect(res.id).toBe('n-1');
      expect(mockAudit.logEvent).toHaveBeenCalledWith(
        mockPrisma,
        'doc-user-1',
        'DOCTOR',
        'CLINICAL_NOTE_CREATED',
        'ClinicalNote',
        'n-1',
        'p-1'
      );
    });
  });

  describe('updateNote', () => {
    it('throws if encounter belongs to another doctor', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        doctor_id: 'd-2',
        status: 'OPEN',
      });
      await expect(
        service.updateNote('doc-user-1', 'e-1', 'n-1', { subjective: 'New' })
      ).rejects.toThrow(NotFoundException);
    });

    it('throws if all texts are cleared', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        doctor_id: 'd-1',
        status: 'OPEN',
      });
      mockPrisma.clinicalNote.findUnique.mockResolvedValue({
        id: 'n-1',
        encounter_id: 'e-1',
        subjective: 'Old',
        objective: null,
        clinical_observations: null,
      });

      await expect(
        service.updateNote('doc-user-1', 'e-1', 'n-1', { subjective: '' })
      ).rejects.toThrow(BadRequestException);
    });

    it('updates successfully', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        doctor_id: 'd-1',
        status: 'OPEN',
      });
      mockPrisma.clinicalNote.findUnique.mockResolvedValue({
        id: 'n-1',
        encounter_id: 'e-1',
        subjective: 'Old',
      });
      mockPrisma.clinicalNote.update.mockResolvedValue({
        id: 'n-1',
      });

      await service.updateNote('doc-user-1', 'e-1', 'n-1', { subjective: 'New' });
      expect(mockPrisma.clinicalNote.update).toHaveBeenCalled();
      expect(mockAudit.logEvent).toHaveBeenCalledWith(
        mockPrisma,
        'doc-user-1',
        'DOCTOR',
        'CLINICAL_NOTE_UPDATED',
        'ClinicalNote',
        'n-1',
        undefined
      );
    });
  });

  describe('getNotes', () => {
    it('allows patient to view own encounter notes', async () => {
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        patient_id: 'p-1',
        patient: { user_id: 'pat-user-1' },
      });
      mockPrisma.clinicalNote.findMany.mockResolvedValue([{ id: 'n-1' }]);

      const res = await service.getNotes('pat-user-1', AppRole.PATIENT, 'e-1');
      expect(res.length).toBe(1);
    });

    it('denies patient viewing other encounter notes', async () => {
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        patient_id: 'p-1',
        patient: { user_id: 'pat-user-2' },
      });

      await expect(service.getNotes('pat-user-1', AppRole.PATIENT, 'e-1')).rejects.toThrow(NotFoundException);
    });

    it('allows associated doctor to view notes', async () => {
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        doctor_id: 'd-1',
        patient_id: 'p-1',
        patient: { user_id: 'pat-1' },
      });
      mockPrisma.doctor.findUnique.mockResolvedValue({ id: 'd-1' });
      mockPrisma.clinicalNote.findMany.mockResolvedValue([{ id: 'n-1' }]);

      const res = await service.getNotes('doc-user-1', AppRole.DOCTOR, 'e-1');
      expect(res.length).toBe(1);
    });

    it('denies unrelated doctor viewing notes', async () => {
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        doctor_id: 'd-1',
        patient_id: 'p-1',
        patient: { user_id: 'pat-1' },
      });
      mockPrisma.doctor.findUnique.mockResolvedValue({ id: 'd-2' });

      await expect(service.getNotes('doc-user-2', AppRole.DOCTOR, 'e-1')).rejects.toThrow(NotFoundException);
    });
  });
});
