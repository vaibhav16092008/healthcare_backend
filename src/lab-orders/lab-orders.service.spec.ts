import { Test, TestingModule } from '@nestjs/testing';
import { LabOrdersService } from './lab-orders.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { vi } from 'vitest';

describe('LabOrdersService', () => {
  let service: LabOrdersService;
  let mockPrisma: any;
  let mockAudit: any;

  beforeEach(async () => {
    mockPrisma = {
      doctor: { findUnique: vi.fn() },
      clinicalEncounter: { findUnique: vi.fn() },
      labTest: { findUnique: vi.fn() },
      labOrder: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      labOrderItem: {
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
        LabOrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<LabOrdersService>(LabOrdersService);
  });

  const setupDoctor = (isVerified = true) => {
    mockPrisma.doctor.findUnique.mockResolvedValue({
      id: 'd-1',
      user_id: 'doc-user-1',
      verification_status: isVerified ? 'VERIFIED' : 'PENDING',
    });
  };

  describe('createLabOrder', () => {
    it('throws if doctor is not verified', async () => {
      setupDoctor(false);
      await expect(
        service.createLabOrder('doc-user-1', 'e-1', { clinical_notes: 'fasting' })
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws if encounter not found', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue(null);
      await expect(
        service.createLabOrder('doc-user-1', 'e-1', { clinical_notes: 'fasting' })
      ).rejects.toThrow(NotFoundException);
    });

    it('throws if encounter belongs to another doctor', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        doctor_id: 'd-2',
      });
      await expect(
        service.createLabOrder('doc-user-1', 'e-1', { clinical_notes: 'fasting' })
      ).rejects.toThrow(NotFoundException);
    });

    it('creates lab order successfully', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'e-1',
        doctor_id: 'd-1',
        patient_id: 'p-1',
        status: 'OPEN',
      });
      mockPrisma.labOrder.create.mockResolvedValue({ id: 'lo-1' });

      const res = await service.createLabOrder('doc-user-1', 'e-1', { clinical_notes: 'fasting' });
      expect(res.id).toBe('lo-1');
      expect(mockAudit.logEvent).toHaveBeenCalledWith(
        mockPrisma, 'doc-user-1', 'DOCTOR', 'LAB_ORDER_CREATED', 'LabOrder', 'lo-1', 'p-1'
      );
    });
  });

  describe('createLabOrderItem', () => {
    it('throws if lab order is not ORDERED', async () => {
      setupDoctor(true);
      mockPrisma.labOrder.findUnique.mockResolvedValue({
        id: 'lo-1',
        doctor_id: 'd-1',
        patient_id: 'p-1',
        status: 'COMPLETED',
        encounter: { status: 'OPEN' }
      });
      await expect(
        service.createLabOrderItem('doc-user-1', 'lo-1', { lab_test_id: 'lt-1', instructions: 'stat' })
      ).rejects.toThrow(ConflictException);
    });

    it('throws if lab test is inactive', async () => {
      setupDoctor(true);
      mockPrisma.labOrder.findUnique.mockResolvedValue({
        id: 'lo-1',
        doctor_id: 'd-1',
        patient_id: 'p-1',
        status: 'ORDERED',
        encounter: { status: 'OPEN' }
      });
      mockPrisma.labTest.findUnique.mockResolvedValue({
        id: 'lt-1',
        is_active: false,
      });

      await expect(
        service.createLabOrderItem('doc-user-1', 'lo-1', { lab_test_id: 'lt-1' })
      ).rejects.toThrow(BadRequestException);
    });

    it('creates item successfully', async () => {
      setupDoctor(true);
      mockPrisma.labOrder.findUnique.mockResolvedValue({
        id: 'lo-1',
        doctor_id: 'd-1',
        patient_id: 'p-1',
        status: 'ORDERED',
        encounter: { status: 'OPEN' }
      });
      mockPrisma.labTest.findUnique.mockResolvedValue({
        id: 'lt-1',
        is_active: true,
      });
      mockPrisma.labOrderItem.create.mockResolvedValue({ id: 'loi-1' });

      const res = await service.createLabOrderItem('doc-user-1', 'lo-1', { lab_test_id: 'lt-1' });
      expect(res.id).toBe('loi-1');
      expect(mockAudit.logEvent).toHaveBeenCalledWith(
        mockPrisma, 'doc-user-1', 'DOCTOR', 'LAB_ORDER_ITEM_CREATED', 'LabOrderItem', 'loi-1', 'p-1'
      );
    });
  });
});
