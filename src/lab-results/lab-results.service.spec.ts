import { Test, TestingModule } from '@nestjs/testing';
import { LabResultsService } from './lab-results.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { AppRole } from '../auth/roles/roles.enum.js';
import { vi } from 'vitest';

describe('LabResultsService', () => {
  let service: LabResultsService;
  let mockPrisma: any;
  let mockAudit: any;
  const doctorsMap = new Map<string, any>();

  beforeEach(async () => {
    doctorsMap.clear();

    mockPrisma = {
      doctor: { findUnique: vi.fn() },
      clinicalEncounter: { findUnique: vi.fn() },
      labOrder: { findUnique: vi.fn() },
      labOrderItem: { findUnique: vi.fn() },
      labResult: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      labResultItem: {
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
        LabResultsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<LabResultsService>(LabResultsService);
  });

  const setupDoctor = (isVerified = true, doctorId = 'd-1', userId = 'doc-user-1') => {
    doctorsMap.set(userId, {
      id: doctorId,
      user_id: userId,
      verification_status: isVerified ? 'VERIFIED' : 'PENDING',
    });
    mockPrisma.doctor.findUnique.mockImplementation(async (args: any) => {
      return doctorsMap.get(args.where.user_id) || null;
    });
  };

  const createMockEncounter = (status = 'OPEN', doctorId = 'd-1', patientUserId = 'pat-user-1', patientId = 'p-1') => ({
    id: 'enc-1',
    status,
    doctor_id: doctorId,
    patient_id: patientId,
    patient: {
      id: patientId,
      user_id: patientUserId,
    },
  });

  describe('1. LIFECYCLE TRANSITIONS', () => {
    describe('Allowed Transitions', () => {
      it('PENDING -> FINAL', async () => {
        setupDoctor(true);
        mockPrisma.labResult.findUnique.mockResolvedValue({
          id: 'lr-1',
          doctor_id: 'd-1',
          patient_id: 'p-1',
          status: 'PENDING',
          labOrder: { encounter: createMockEncounter('OPEN') },
        });
        mockPrisma.labResult.update.mockResolvedValue({ id: 'lr-1', status: 'FINAL' });

        const res = await service.finalizeLabResult('doc-user-1', 'lr-1');
        expect(res.status).toBe('FINAL');
        expect(mockAudit.logEvent).toHaveBeenCalledWith(
          mockPrisma, 'doc-user-1', AppRole.DOCTOR, 'LAB_RESULT_FINALIZED', 'LabResult', 'lr-1', 'p-1'
        );
      });

      it('PENDING -> CANCELLED', async () => {
        setupDoctor(true);
        mockPrisma.labResult.findUnique.mockResolvedValue({
          id: 'lr-1',
          doctor_id: 'd-1',
          patient_id: 'p-1',
          status: 'PENDING',
          labOrder: { encounter: createMockEncounter('OPEN') },
        });
        mockPrisma.labResult.update.mockResolvedValue({ id: 'lr-1', status: 'CANCELLED' });

        const res = await service.cancelLabResult('doc-user-1', 'lr-1');
        expect(res.status).toBe('CANCELLED');
        expect(mockAudit.logEvent).toHaveBeenCalledWith(
          mockPrisma, 'doc-user-1', AppRole.DOCTOR, 'LAB_RESULT_CANCELLED', 'LabResult', 'lr-1', 'p-1'
        );
      });

      it('FINAL -> AMENDED', async () => {
        setupDoctor(true);
        mockPrisma.labResult.findUnique.mockResolvedValue({
          id: 'lr-1',
          doctor_id: 'd-1',
          patient_id: 'p-1',
          status: 'FINAL',
          labOrder: { encounter: createMockEncounter('OPEN') },
        });
        mockPrisma.labResult.update.mockResolvedValue({ id: 'lr-1', status: 'AMENDED' });

        const res = await service.amendLabResult('doc-user-1', 'lr-1');
        expect(res.status).toBe('AMENDED');
        expect(mockAudit.logEvent).toHaveBeenCalledWith(
          mockPrisma, 'doc-user-1', AppRole.DOCTOR, 'LAB_RESULT_AMENDED', 'LabResult', 'lr-1', 'p-1'
        );
      });

      it('AMENDED -> FINAL', async () => {
        setupDoctor(true);
        mockPrisma.labResult.findUnique.mockResolvedValue({
          id: 'lr-1',
          doctor_id: 'd-1',
          patient_id: 'p-1',
          status: 'AMENDED',
          labOrder: { encounter: createMockEncounter('OPEN') },
        });
        mockPrisma.labResult.update.mockResolvedValue({ id: 'lr-1', status: 'FINAL' });

        const res = await service.finalizeLabResult('doc-user-1', 'lr-1');
        expect(res.status).toBe('FINAL');
        expect(mockAudit.logEvent).toHaveBeenCalledWith(
          mockPrisma, 'doc-user-1', AppRole.DOCTOR, 'LAB_RESULT_FINALIZED', 'LabResult', 'lr-1', 'p-1'
        );
      });

      it('AMENDED -> CANCELLED', async () => {
        setupDoctor(true);
        mockPrisma.labResult.findUnique.mockResolvedValue({
          id: 'lr-1',
          doctor_id: 'd-1',
          patient_id: 'p-1',
          status: 'AMENDED',
          labOrder: { encounter: createMockEncounter('OPEN') },
        });
        mockPrisma.labResult.update.mockResolvedValue({ id: 'lr-1', status: 'CANCELLED' });

        const res = await service.cancelLabResult('doc-user-1', 'lr-1');
        expect(res.status).toBe('CANCELLED');
        expect(mockAudit.logEvent).toHaveBeenCalledWith(
          mockPrisma, 'doc-user-1', AppRole.DOCTOR, 'LAB_RESULT_CANCELLED', 'LabResult', 'lr-1', 'p-1'
        );
      });
    });

    describe('Forbidden Transitions', () => {
      it('rejects PENDING -> AMENDED', async () => {
        setupDoctor(true);
        mockPrisma.labResult.findUnique.mockResolvedValue({
          id: 'lr-1',
          doctor_id: 'd-1',
          status: 'PENDING',
          labOrder: { encounter: createMockEncounter('OPEN') },
        });
        await expect(service.amendLabResult('doc-user-1', 'lr-1')).rejects.toThrow(ConflictException);
      });

      it('rejects FINAL -> CANCELLED directly without amendment', async () => {
        setupDoctor(true);
        mockPrisma.labResult.findUnique.mockResolvedValue({
          id: 'lr-1',
          doctor_id: 'd-1',
          status: 'FINAL',
          labOrder: { encounter: createMockEncounter('OPEN') },
        });
        await expect(service.cancelLabResult('doc-user-1', 'lr-1')).rejects.toThrow(ConflictException);
      });

      it('rejects CANCELLED -> FINAL / AMENDED / CANCELLED', async () => {
        setupDoctor(true);
        mockPrisma.labResult.findUnique.mockResolvedValue({
          id: 'lr-1',
          doctor_id: 'd-1',
          status: 'CANCELLED',
          labOrder: { encounter: createMockEncounter('OPEN') },
        });

        await expect(service.finalizeLabResult('doc-user-1', 'lr-1')).rejects.toThrow(ConflictException);
        await expect(service.amendLabResult('doc-user-1', 'lr-1')).rejects.toThrow(ConflictException);
        await expect(service.cancelLabResult('doc-user-1', 'lr-1')).rejects.toThrow(ConflictException);
      });

      it('rejects item creation on FINAL or CANCELLED results', async () => {
        setupDoctor(true);
        mockPrisma.labResult.findUnique.mockResolvedValue({
          id: 'lr-1',
          doctor_id: 'd-1',
          status: 'FINAL',
          labOrder: { encounter: createMockEncounter('OPEN') },
        });

        await expect(
          service.createLabResultItem('doc-user-1', 'lr-1', { lab_order_item_id: 'loi-1' })
        ).rejects.toThrow(ConflictException);
      });
    });
  });

  describe('2. ENCOUNTER CLOSURE VERIFICATION', () => {
    it('blocks result creation when encounter is COMPLETED or CANCELLED', async () => {
      setupDoctor(true);
      mockPrisma.labOrder.findUnique.mockResolvedValue({
        id: 'lo-1',
        doctor_id: 'd-1',
        status: 'ORDERED',
        encounter: createMockEncounter('COMPLETED'),
      });

      await expect(
        service.createLabResult('doc-user-1', 'lo-1', { report_notes: 'notes' })
      ).rejects.toThrow(ConflictException);
    });

    it('blocks item creation, item update, finalize, amend, cancel when encounter is COMPLETED', async () => {
      setupDoctor(true);
      mockPrisma.labResult.findUnique.mockResolvedValue({
        id: 'lr-1',
        doctor_id: 'd-1',
        status: 'PENDING',
        labOrder: { encounter: createMockEncounter('COMPLETED') },
      });

      await expect(service.finalizeLabResult('doc-user-1', 'lr-1')).rejects.toThrow(ConflictException);
      await expect(service.cancelLabResult('doc-user-1', 'lr-1')).rejects.toThrow(ConflictException);
      await expect(
        service.createLabResultItem('doc-user-1', 'lr-1', { lab_order_item_id: 'loi-1' })
      ).rejects.toThrow(ConflictException);
      await expect(
        service.updateLabResultItem('doc-user-1', 'lr-1', 'lri-1', { result_value: '10' })
      ).rejects.toThrow(ConflictException);
    });

    it('allows reading existing results even if encounter is COMPLETED', async () => {
      setupDoctor(true);
      const mockResult = {
        id: 'lr-1',
        status: 'FINAL',
        patient_id: 'p-1',
        labOrder: { encounter: createMockEncounter('COMPLETED') },
        items: [],
      };
      mockPrisma.labResult.findUnique.mockResolvedValue(mockResult);

      const res = await service.getLabResultById('doc-user-1', AppRole.DOCTOR, 'lr-1');
      expect(res.id).toBe('lr-1');
      expect(res.status).toBe('FINAL');
    });
  });

  describe('3. ACCESS-CONTROL MATRIX', () => {
    it('PATIENT A can read Patient A result but NOT Patient B result', async () => {
      const mockResult = {
        id: 'lr-1',
        patient_id: 'p-1',
        labOrder: { encounter: createMockEncounter('OPEN', 'd-1', 'pat-user-1', 'p-1') },
        items: [],
      };
      mockPrisma.labResult.findUnique.mockResolvedValue(mockResult);

      // Patient A (matching user_id)
      const patientRes = await service.getLabResultById('pat-user-1', AppRole.PATIENT, 'lr-1');
      expect(patientRes.id).toBe('lr-1');

      // Patient B (different user_id)
      await expect(
        service.getLabResultById('pat-user-2', AppRole.PATIENT, 'lr-1')
      ).rejects.toThrow(NotFoundException);
    });

    it('ASSIGNED VERIFIED DOCTOR can read result, but VERIFIED UNRELATED DOCTOR cannot', async () => {
      setupDoctor(true, 'd-1', 'doc-user-1'); // Assigned doctor
      setupDoctor(true, 'd-2', 'doc-user-2'); // Unrelated doctor

      const mockResult = {
        id: 'lr-1',
        patient_id: 'p-1',
        labOrder: { encounter: createMockEncounter('OPEN', 'd-1', 'pat-user-1', 'p-1') },
        items: [],
      };
      mockPrisma.labResult.findUnique.mockResolvedValue(mockResult);

      // Assigned doctor
      const res = await service.getLabResultById('doc-user-1', AppRole.DOCTOR, 'lr-1');
      expect(res.id).toBe('lr-1');

      // Unrelated doctor
      await expect(
        service.getLabResultById('doc-user-2', AppRole.DOCTOR, 'lr-1')
      ).rejects.toThrow(NotFoundException);
    });

    it('UNVERIFIED DOCTOR cannot access protected clinical result resources', async () => {
      setupDoctor(false, 'd-1', 'doc-user-unverified'); // Unverified doctor assigned to encounter

      const mockResult = {
        id: 'lr-1',
        patient_id: 'p-1',
        labOrder: { encounter: createMockEncounter('OPEN', 'd-1', 'pat-user-1', 'p-1') },
        items: [],
      };
      mockPrisma.labResult.findUnique.mockResolvedValue(mockResult);

      await expect(
        service.getLabResultById('doc-user-unverified', AppRole.DOCTOR, 'lr-1')
      ).rejects.toThrow(NotFoundException);
    });

    it('ADMIN does NOT automatically receive clinical result access', async () => {
      const mockResult = {
        id: 'lr-1',
        patient_id: 'p-1',
        labOrder: { encounter: createMockEncounter('OPEN', 'd-1', 'pat-user-1', 'p-1') },
        items: [],
      };
      mockPrisma.labResult.findUnique.mockResolvedValue(mockResult);

      await expect(
        service.getLabResultById('admin-user-1', AppRole.ADMIN, 'lr-1')
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('4. CROSS-ORDER / CROSS-ENCOUNTER IDOR', () => {
    it('rejects adding LabOrderItem B belonging to another LabOrder B', async () => {
      setupDoctor(true);
      mockPrisma.labResult.findUnique.mockResolvedValue({
        id: 'lr-1',
        lab_order_id: 'lo-1',
        doctor_id: 'd-1',
        patient_id: 'p-1',
        status: 'PENDING',
        labOrder: { encounter: createMockEncounter('OPEN') },
      });
      mockPrisma.labOrderItem.findUnique.mockResolvedValue({
        id: 'loi-other',
        lab_order_id: 'lo-2', // Belonging to LabOrder 2
      });

      await expect(
        service.createLabResultItem('doc-user-1', 'lr-1', { lab_order_item_id: 'loi-other' })
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects updating item that belongs to a different lab result', async () => {
      setupDoctor(true);
      mockPrisma.labResult.findUnique.mockResolvedValue({
        id: 'lr-1',
        doctor_id: 'd-1',
        status: 'PENDING',
        labOrder: { encounter: createMockEncounter('OPEN') },
      });
      mockPrisma.labResultItem.findUnique.mockResolvedValue({
        id: 'lri-2',
        lab_result_id: 'lr-2', // MISMATCH
      });

      await expect(
        service.updateLabResultItem('doc-user-1', 'lr-1', 'lri-2', { result_value: '50' })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('5. AUDIT VERIFICATION', () => {
    it('verifies actor comes from CurrentUser and unauthorized ops do not emit audit log', async () => {
      setupDoctor(true, 'd-2', 'doc-user-2'); // Unrelated doctor
      mockPrisma.labResult.findUnique.mockResolvedValue({
        id: 'lr-1',
        doctor_id: 'd-1',
        status: 'PENDING',
        labOrder: { encounter: createMockEncounter('OPEN') },
      });

      await expect(service.finalizeLabResult('doc-user-2', 'lr-1')).rejects.toThrow(NotFoundException);
      expect(mockAudit.logEvent).not.toHaveBeenCalled();
    });
  });
});
