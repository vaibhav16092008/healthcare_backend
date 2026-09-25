import { Test, TestingModule } from '@nestjs/testing';
import { TreatmentPlansService } from './treatment-plans.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { AppRole } from '../auth/roles/roles.enum.js';
import { Prisma, TreatmentInstructionType, TreatmentInstructionPriority } from '@prisma/client';
import { vi } from 'vitest';

describe('TreatmentPlansService', () => {
  let service: TreatmentPlansService;
  let mockPrisma: any;
  let mockAudit: any;

  beforeEach(async () => {
    mockPrisma = {
      doctor: { findUnique: vi.fn() },
      clinicalEncounter: { findUnique: vi.fn() },
      treatmentPlan: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      treatmentInstruction: {
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
        TreatmentPlansService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<TreatmentPlansService>(TreatmentPlansService);
  });

  const setupDoctor = (isVerified = true) => {
    mockPrisma.doctor.findUnique.mockResolvedValue({
      id: 'd-1',
      user_id: 'doc-user-1',
      verification_status: isVerified ? 'VERIFIED' : 'PENDING',
    });
  };

  describe('createPlan', () => {
    it('throws if neither title nor summary is meaningful', async () => {
      await expect(
        service.createPlan('doc-user-1', 'e-1', { title: '  ', summary: '' })
      ).rejects.toThrow(BadRequestException);
    });

    it('throws if doctor is not verified', async () => {
      setupDoctor(false);
      await expect(
        service.createPlan('doc-user-1', 'e-1', { title: 'Diet Plan' })
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws if encounter not found', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue(null);
      await expect(
        service.createPlan('doc-user-1', 'e-1', { title: 'Diet Plan' })
      ).rejects.toThrow(NotFoundException);
    });

    it('throws if encounter belongs to another doctor', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        doctor_id: 'd-2',
      });
      await expect(
        service.createPlan('doc-user-1', 'e-1', { title: 'Diet Plan' })
      ).rejects.toThrow(NotFoundException);
    });

    it('throws if plan already exists for encounter', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        doctor_id: 'd-1',
        status: 'OPEN',
        treatmentPlan: { id: 'tp-1' }
      });
      await expect(
        service.createPlan('doc-user-1', 'e-1', { title: 'Diet Plan' })
      ).rejects.toThrow(ConflictException);
    });

    it('creates plan successfully', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        doctor_id: 'd-1',
        patient_id: 'p-1',
        status: 'OPEN',
        treatmentPlan: null
      });
      mockPrisma.treatmentPlan.create.mockResolvedValue({ id: 'tp-1' });

      const res = await service.createPlan('doc-user-1', 'e-1', { title: 'Diet Plan' });
      expect(res.id).toBe('tp-1');
      expect(mockAudit.logEvent).toHaveBeenCalledWith(
        mockPrisma, 'doc-user-1', 'DOCTOR', 'TREATMENT_PLAN_CREATED', 'TreatmentPlan', 'tp-1', 'p-1'
      );
    });
  });

  describe('createInstruction', () => {
    it('throws if text is blank', async () => {
      await expect(
        service.createInstruction('doc-user-1', 'e-1', { instruction_type: 'GENERAL', instruction_text: '  ', priority: 'ROUTINE' })
      ).rejects.toThrow(BadRequestException);
    });

    it('throws if plan is not ACTIVE', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        doctor_id: 'd-1',
        patient_id: 'p-1',
        status: 'OPEN',
        treatmentPlan: { id: 'tp-1', status: 'COMPLETED' }
      });
      await expect(
        service.createInstruction('doc-user-1', 'e-1', { instruction_type: 'GENERAL', instruction_text: 'Rest', priority: 'ROUTINE' })
      ).rejects.toThrow(ConflictException);
    });

    it('creates instruction successfully', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        doctor_id: 'd-1',
        patient_id: 'p-1',
        status: 'OPEN',
        treatmentPlan: { id: 'tp-1', status: 'ACTIVE' }
      });
      mockPrisma.treatmentInstruction.create.mockResolvedValue({ id: 'ti-1' });

      const res = await service.createInstruction('doc-user-1', 'e-1', { instruction_type: 'GENERAL', instruction_text: 'Rest', priority: 'ROUTINE' });
      expect(res.id).toBe('ti-1');
      expect(mockAudit.logEvent).toHaveBeenCalledWith(
        mockPrisma, 'doc-user-1', 'DOCTOR', 'TREATMENT_INSTRUCTION_CREATED', 'TreatmentInstruction', 'ti-1', 'p-1'
      );
    });
  });
});
