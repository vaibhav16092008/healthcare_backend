import { Test, TestingModule } from '@nestjs/testing';
import { MedicalDataAccessService } from './medical-data-access.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';

describe('MedicalDataAccessService', () => {
  let service: MedicalDataAccessService;
  let mockPrisma: any;
  let mockAudit: any;

  beforeEach(async () => {
    mockPrisma = {
      patient: { findUnique: vi.fn() },
      doctor: { findFirst: vi.fn(), findUnique: vi.fn() },
      medicalDataAccessGrant: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
      },
      $transaction: vi.fn((cb) => cb(mockPrisma)),
    };

    mockAudit = {
      logEvent: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MedicalDataAccessService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<MedicalDataAccessService>(MedicalDataAccessService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createGrant', () => {
    it('should throw if doctor not verified', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 'p-1' });
      mockPrisma.doctor.findFirst.mockResolvedValue(null);
      await expect(service.createGrant('p-user', 'd-1')).rejects.toThrow(NotFoundException);
    });

    it('should create grant and audit event if doctor verified', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 'p-1' });
      mockPrisma.doctor.findFirst.mockResolvedValue({ id: 'd-1' });
      mockPrisma.medicalDataAccessGrant.findFirst.mockResolvedValue(null);
      mockPrisma.medicalDataAccessGrant.create.mockResolvedValue({ id: 'g-1' });

      await service.createGrant('p-user', 'd-1');
      expect(mockPrisma.medicalDataAccessGrant.create).toHaveBeenCalled();
      expect(mockAudit.logEvent).toHaveBeenCalledWith(
        expect.anything(),
        'p-user',
        'PATIENT',
        'MEDICAL_ACCESS_GRANTED',
        'MedicalDataAccessGrant',
        'g-1',
        'p-1',
        { doctor_id: 'd-1' }
      );
    });
  });

  describe('revokeGrant', () => {
    it('should revoke and audit', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 'p-1' });
      mockPrisma.medicalDataAccessGrant.findFirst.mockResolvedValue({ id: 'g-1', status: 'ACTIVE', doctor_id: 'd-1' });
      mockPrisma.medicalDataAccessGrant.update.mockResolvedValue({ id: 'g-1', doctor_id: 'd-1', status: 'REVOKED' });

      await service.revokeGrant('p-user', 'g-1');
      expect(mockPrisma.medicalDataAccessGrant.update).toHaveBeenCalled();
      expect(mockAudit.logEvent).toHaveBeenCalledWith(
        expect.anything(),
        'p-user',
        'PATIENT',
        'MEDICAL_ACCESS_REVOKED',
        'MedicalDataAccessGrant',
        'g-1',
        'p-1',
        { doctor_id: 'd-1' }
      );
    });
  });

  describe('verifyDoctorAccess', () => {
    it('returns true if active grant exists', async () => {
      mockPrisma.medicalDataAccessGrant.findFirst.mockResolvedValue({ id: 'g-1' });
      const result = await service.verifyDoctorAccess('d-1', 'p-1');
      expect(result).toBe(true);
    });

    it('returns false if no grant', async () => {
      mockPrisma.medicalDataAccessGrant.findFirst.mockResolvedValue(null);
      const result = await service.verifyDoctorAccess('d-1', 'p-1');
      expect(result).toBe(false);
    });
  });
});
