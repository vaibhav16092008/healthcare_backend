import { Test, TestingModule } from '@nestjs/testing';
import { PrescriptionsService } from './prescriptions.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { vi } from 'vitest';

describe('PrescriptionsService', () => {
  let service: PrescriptionsService;
  let mockPrisma: any;
  let mockAudit: any;

  beforeEach(async () => {
    mockPrisma = {
      doctor: { findUnique: vi.fn() },
      clinicalEncounter: { findUnique: vi.fn() },
      medication: { findUnique: vi.fn() },
      prescription: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      prescriptionItem: {
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
        PrescriptionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<PrescriptionsService>(PrescriptionsService);
  });

  const setupDoctor = (isVerified = true) => {
    mockPrisma.doctor.findUnique.mockResolvedValue({
      id: 'd-1',
      user_id: 'doc-user-1',
      verification_status: isVerified ? 'VERIFIED' : 'PENDING',
    });
  };

  describe('createPrescription', () => {
    it('throws if doctor is not verified', async () => {
      setupDoctor(false);
      await expect(
        service.createPrescription('doc-user-1', 'e-1', { notes: 'take care' })
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws if encounter not found', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue(null);
      await expect(
        service.createPrescription('doc-user-1', 'e-1', { notes: 'take care' })
      ).rejects.toThrow(NotFoundException);
    });

    it('throws if encounter belongs to another doctor', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        doctor_id: 'd-2',
      });
      await expect(
        service.createPrescription('doc-user-1', 'e-1', { notes: 'take care' })
      ).rejects.toThrow(NotFoundException);
    });

    it('creates prescription successfully', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        doctor_id: 'd-1',
        patient_id: 'p-1',
        status: 'OPEN',
      });
      mockPrisma.prescription.create.mockResolvedValue({ id: 'pr-1' });

      const res = await service.createPrescription('doc-user-1', 'e-1', { notes: 'take care' });
      expect(res.id).toBe('pr-1');
      expect(mockAudit.logEvent).toHaveBeenCalledWith(
        mockPrisma, 'doc-user-1', 'DOCTOR', 'PRESCRIPTION_CREATED', 'Prescription', 'pr-1', 'p-1'
      );
    });
  });

  describe('createPrescriptionItem', () => {
    it('throws if dosage is blank', async () => {
      await expect(
        service.createPrescriptionItem('doc-user-1', 'pr-1', { medication_id: 'm-1', dosage: '  ', frequency: 'daily' })
      ).rejects.toThrow(BadRequestException);
    });

    it('throws if medication is inactive', async () => {
      setupDoctor(true);
      mockPrisma.prescription.findUnique.mockResolvedValue({
        id: 'pr-1',
        doctor_id: 'd-1',
        patient_id: 'p-1',
        status: 'ACTIVE',
        encounter: { status: 'OPEN' }
      });
      mockPrisma.medication.findUnique.mockResolvedValue({
        id: 'm-1',
        is_active: false,
      });

      await expect(
        service.createPrescriptionItem('doc-user-1', 'pr-1', { medication_id: 'm-1', dosage: '10mg', frequency: 'daily' })
      ).rejects.toThrow(BadRequestException);
    });

    it('creates item successfully', async () => {
      setupDoctor(true);
      mockPrisma.prescription.findUnique.mockResolvedValue({
        id: 'pr-1',
        doctor_id: 'd-1',
        patient_id: 'p-1',
        status: 'ACTIVE',
        encounter: { status: 'OPEN' }
      });
      mockPrisma.medication.findUnique.mockResolvedValue({
        id: 'm-1',
        is_active: true,
      });
      mockPrisma.prescriptionItem.create.mockResolvedValue({ id: 'pri-1' });

      const res = await service.createPrescriptionItem('doc-user-1', 'pr-1', { medication_id: 'm-1', dosage: '10mg', frequency: 'daily' });
      expect(res.id).toBe('pri-1');
      expect(mockAudit.logEvent).toHaveBeenCalledWith(
        mockPrisma, 'doc-user-1', 'DOCTOR', 'PRESCRIPTION_ITEM_CREATED', 'PrescriptionItem', 'pri-1', 'p-1'
      );
    });
  });
});
