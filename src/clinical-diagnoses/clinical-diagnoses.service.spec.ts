import { Test, TestingModule } from '@nestjs/testing';
import { ClinicalDiagnosesService } from './clinical-diagnoses.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { AppRole } from '../auth/roles/roles.enum.js';
import { Prisma, ClinicalDiagnosisType, ClinicalDiagnosisStatus } from '@prisma/client';
import { vi } from 'vitest';

describe('ClinicalDiagnosesService', () => {
  let service: ClinicalDiagnosesService;
  let mockPrisma: any;
  let mockAudit: any;

  beforeEach(async () => {
    mockPrisma = {
      doctor: { findUnique: vi.fn() },
      clinicalEncounter: { findUnique: vi.fn() },
      clinicalDiagnosis: {
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
        ClinicalDiagnosesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<ClinicalDiagnosesService>(ClinicalDiagnosesService);
  });

  const setupDoctor = (isVerified = true) => {
    mockPrisma.doctor.findUnique.mockResolvedValue({
      id: 'd-1',
      user_id: 'doc-user-1',
      verification_status: isVerified ? 'VERIFIED' : 'PENDING',
    });
  };

  describe('createDiagnosis', () => {
    it('throws if diagnosis_name is blank', async () => {
      await expect(
        service.createDiagnosis('doc-user-1', 'e-1', { diagnosis_type: ClinicalDiagnosisType.PRIMARY, diagnosis_name: '   ' })
      ).rejects.toThrow(BadRequestException);
    });

    it('throws if doctor is not verified', async () => {
      setupDoctor(false);
      await expect(
        service.createDiagnosis('doc-user-1', 'e-1', { diagnosis_type: ClinicalDiagnosisType.PRIMARY, diagnosis_name: 'Fever' })
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws if encounter not found', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue(null);
      await expect(
        service.createDiagnosis('doc-user-1', 'e-1', { diagnosis_type: ClinicalDiagnosisType.PRIMARY, diagnosis_name: 'Fever' })
      ).rejects.toThrow(NotFoundException);
    });

    it('throws if encounter belongs to another doctor', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        doctor_id: 'd-2',
      });
      await expect(
        service.createDiagnosis('doc-user-1', 'e-1', { diagnosis_type: ClinicalDiagnosisType.PRIMARY, diagnosis_name: 'Fever' })
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws if encounter is not OPEN', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        doctor_id: 'd-1',
        status: 'COMPLETED',
      });
      await expect(
        service.createDiagnosis('doc-user-1', 'e-1', { diagnosis_type: ClinicalDiagnosisType.PRIMARY, diagnosis_name: 'Fever' })
      ).rejects.toThrow(ConflictException);
    });

    it('creates diagnosis successfully', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        doctor_id: 'd-1',
        patient_id: 'p-1',
        status: 'OPEN',
      });
      mockPrisma.clinicalDiagnosis.create.mockResolvedValue({ id: 'diag-1' });

      const res = await service.createDiagnosis('doc-user-1', 'e-1', { diagnosis_type: ClinicalDiagnosisType.PRIMARY, diagnosis_name: 'Fever' });
      expect(res.id).toBe('diag-1');
      expect(mockAudit.logEvent).toHaveBeenCalledWith(
        mockPrisma, 'doc-user-1', 'DOCTOR', 'CLINICAL_DIAGNOSIS_CREATED', 'ClinicalDiagnosis', 'diag-1', 'p-1'
      );
    });
  });

  describe('updateDiagnosis', () => {
    it('throws if diagnosis_name is blank', async () => {
      await expect(
        service.updateDiagnosis('doc-user-1', 'e-1', 'diag-1', { diagnosis_name: '  ' })
      ).rejects.toThrow(BadRequestException);
    });

    it('throws if encounter belongs to another doctor', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        doctor_id: 'd-2',
        status: 'OPEN',
      });
      await expect(
        service.updateDiagnosis('doc-user-1', 'e-1', 'diag-1', { diagnosis_name: 'Cold' })
      ).rejects.toThrow(NotFoundException);
    });

    it('updates successfully', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        doctor_id: 'd-1',
        patient_id: 'p-1',
        status: 'OPEN',
      });
      mockPrisma.clinicalDiagnosis.findUnique.mockResolvedValue({
        id: 'diag-1',
        encounter_id: 'e-1',
      });
      mockPrisma.clinicalDiagnosis.update.mockResolvedValue({ id: 'diag-1' });

      await service.updateDiagnosis('doc-user-1', 'e-1', 'diag-1', { diagnosis_name: 'Cold' });
      expect(mockPrisma.clinicalDiagnosis.update).toHaveBeenCalled();
      expect(mockAudit.logEvent).toHaveBeenCalledWith(
        mockPrisma, 'doc-user-1', 'DOCTOR', 'CLINICAL_DIAGNOSIS_UPDATED', 'ClinicalDiagnosis', 'diag-1', 'p-1'
      );
    });
  });

  describe('resolveDiagnosis', () => {
    it('throws if encounter is COMPLETED', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        doctor_id: 'd-1',
        status: 'COMPLETED',
      });
      await expect(
        service.resolveDiagnosis('doc-user-1', 'e-1', 'diag-1')
      ).rejects.toThrow(ConflictException);
    });

    it('resolves successfully', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        doctor_id: 'd-1',
        patient_id: 'p-1',
        status: 'OPEN',
      });
      mockPrisma.clinicalDiagnosis.findUnique.mockResolvedValue({
        id: 'diag-1',
        encounter_id: 'e-1',
        status: 'ACTIVE',
      });
      mockPrisma.clinicalDiagnosis.update.mockResolvedValue({ id: 'diag-1' });

      await service.resolveDiagnosis('doc-user-1', 'e-1', 'diag-1');
      expect(mockPrisma.clinicalDiagnosis.update).toHaveBeenCalled();
      expect(mockAudit.logEvent).toHaveBeenCalledWith(
        mockPrisma, 'doc-user-1', 'DOCTOR', 'CLINICAL_DIAGNOSIS_RESOLVED', 'ClinicalDiagnosis', 'diag-1', 'p-1'
      );
    });
  });

  describe('getDiagnoses', () => {
    it('allows patient to view own encounter diagnoses', async () => {
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        patient_id: 'p-1',
        patient: { user_id: 'pat-user-1' },
      });
      mockPrisma.clinicalDiagnosis.findMany.mockResolvedValue([{ id: 'diag-1' }]);

      const res = await service.getDiagnoses('pat-user-1', AppRole.PATIENT, 'e-1');
      expect(res.length).toBe(1);
    });
  });

  describe('getDiagnosisById', () => {
    it('allows doctor to view', async () => {
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        doctor_id: 'd-1',
        patient_id: 'p-1',
        patient: { user_id: 'pat-user-1' },
      });
      mockPrisma.doctor.findUnique.mockResolvedValue({ id: 'd-1' });
      mockPrisma.clinicalDiagnosis.findFirst.mockResolvedValue({ id: 'diag-1' });

      const res = await service.getDiagnosisById('doc-user-1', AppRole.DOCTOR, 'e-1', 'diag-1');
      expect(res.id).toBe('diag-1');
    });
  });
});
