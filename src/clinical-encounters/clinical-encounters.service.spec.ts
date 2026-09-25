import { Test, TestingModule } from '@nestjs/testing';
import { ClinicalEncountersService } from './clinical-encounters.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { AppRole } from '../auth/roles/roles.enum.js';
import { Prisma } from '@prisma/client';
import { vi } from 'vitest';

describe('ClinicalEncountersService', () => {
  let service: ClinicalEncountersService;
  let mockPrisma: any;
  let mockAudit: any;

  beforeEach(async () => {
    mockPrisma = {
      doctor: { findUnique: vi.fn() },
      patient: { findUnique: vi.fn() },
      appointment: { findUnique: vi.fn() },
      clinicalEncounter: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
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
        ClinicalEncountersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<ClinicalEncountersService>(ClinicalEncountersService);
  });

  const setupDoctor = (isVerified = true) => {
    mockPrisma.doctor.findUnique.mockResolvedValue({
      id: 'd-1',
      verification_status: isVerified ? 'VERIFIED' : 'PENDING',
    });
  };

  describe('createEncounter', () => {
    it('throws if doctor is not verified', async () => {
      setupDoctor(false);
      await expect(service.createEncounter('doc-user-1', 'app-1')).rejects.toThrow(ForbiddenException);
    });

    it('throws if appointment not found', async () => {
      setupDoctor(true);
      mockPrisma.appointment.findUnique.mockResolvedValue(null);
      await expect(service.createEncounter('doc-user-1', 'app-1')).rejects.toThrow(NotFoundException);
    });

    it('throws if doctor does not own the appointment', async () => {
      setupDoctor(true);
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 'app-1',
        doctorClinic: { doctor_id: 'd-2' }, // different doctor
      });
      await expect(service.createEncounter('doc-user-1', 'app-1')).rejects.toThrow(NotFoundException);
    });

    it('throws if doctor-clinic is not ACTIVE', async () => {
      setupDoctor(true);
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 'app-1',
        status: 'BOOKED',
        doctorClinic: { doctor_id: 'd-1', status: 'INACTIVE', clinic: { status: 'ACTIVE' } },
      });
      await expect(service.createEncounter('doc-user-1', 'app-1')).rejects.toThrow(ForbiddenException);
    });

    it('throws if clinic is not ACTIVE', async () => {
      setupDoctor(true);
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 'app-1',
        status: 'BOOKED',
        doctorClinic: { doctor_id: 'd-1', status: 'ACTIVE', clinic: { status: 'INACTIVE' } },
      });
      await expect(service.createEncounter('doc-user-1', 'app-1')).rejects.toThrow(ForbiddenException);
    });

    it('throws if appointment is not BOOKED', async () => {
      setupDoctor(true);
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 'app-1',
        status: 'CANCELLED',
        doctorClinic: { doctor_id: 'd-1', status: 'ACTIVE', clinic: { status: 'ACTIVE' } },
      });
      await expect(service.createEncounter('doc-user-1', 'app-1')).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException if encounter already exists (P2002)', async () => {
      setupDoctor(true);
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 'app-1',
        status: 'BOOKED',
        doctorClinic: { doctor_id: 'd-1', status: 'ACTIVE', clinic: { status: 'ACTIVE' } },
      });
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue({ id: 'e-1' });
      await expect(service.createEncounter('doc-user-1', 'app-1')).rejects.toThrow(ConflictException);
    });

    it('creates encounter successfully', async () => {
      setupDoctor(true);
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 'app-1',
        patient_id: 'p-1',
        doctor_clinic_id: 'dc-1',
        clinic_location_id: 'cl-1',
        status: 'BOOKED',
        doctorClinic: { doctor_id: 'd-1', status: 'ACTIVE', clinic: { status: 'ACTIVE' } },
      });
      mockPrisma.clinicalEncounter.findUnique.mockResolvedValue(null);
      mockPrisma.clinicalEncounter.create.mockResolvedValue({
        id: 'e-1',
        patient_id: 'p-1',
      });

      const res = await service.createEncounter('doc-user-1', 'app-1');
      expect(res.id).toBe('e-1');
      expect(mockAudit.logEvent).toHaveBeenCalledWith(
        mockPrisma,
        'doc-user-1',
        'DOCTOR',
        'CLINICAL_ENCOUNTER_CREATED',
        'ClinicalEncounter',
        'e-1',
        'p-1'
      );
    });
  });

  describe('startEncounter', () => {
    it('throws if not found', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findFirst.mockResolvedValue(null);
      await expect(service.startEncounter('doc-user-1', 'e-1')).rejects.toThrow(NotFoundException);
    });

    it('throws if already CANCELLED', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findFirst.mockResolvedValue({ id: 'e-1', status: 'CANCELLED' });
      await expect(service.startEncounter('doc-user-1', 'e-1')).rejects.toThrow(ConflictException);
    });

    it('returns existing if already started', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findFirst.mockResolvedValue({ id: 'e-1', status: 'OPEN', started_at: new Date() });
      const res = await service.startEncounter('doc-user-1', 'e-1');
      expect(res.id).toBe('e-1');
      expect(mockPrisma.clinicalEncounter.update).not.toHaveBeenCalled();
    });

    it('starts successfully', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findFirst.mockResolvedValue({ id: 'e-1', status: 'OPEN', started_at: null });
      mockPrisma.clinicalEncounter.update.mockResolvedValue({ id: 'e-1', patient_id: 'p-1', status: 'OPEN', started_at: new Date() });
      await service.startEncounter('doc-user-1', 'e-1');
      expect(mockPrisma.clinicalEncounter.update).toHaveBeenCalled();
      expect(mockAudit.logEvent).toHaveBeenCalledWith(
        mockPrisma,
        'doc-user-1',
        'DOCTOR',
        'CLINICAL_ENCOUNTER_STARTED',
        'ClinicalEncounter',
        'e-1',
        'p-1'
      );
    });
  });

  describe('completeEncounter', () => {
    it('throws if not started', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findFirst.mockResolvedValue({ id: 'e-1', status: 'OPEN', started_at: null });
      await expect(service.completeEncounter('doc-user-1', 'e-1')).rejects.toThrow(ConflictException);
    });

    it('completes successfully', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findFirst.mockResolvedValue({ id: 'e-1', status: 'OPEN', started_at: new Date() });
      mockPrisma.clinicalEncounter.update.mockResolvedValue({ id: 'e-1', patient_id: 'p-1', status: 'COMPLETED' });
      await service.completeEncounter('doc-user-1', 'e-1');
      expect(mockPrisma.clinicalEncounter.update).toHaveBeenCalled();
      expect(mockAudit.logEvent).toHaveBeenCalledWith(
        mockPrisma,
        'doc-user-1',
        'DOCTOR',
        'CLINICAL_ENCOUNTER_COMPLETED',
        'ClinicalEncounter',
        'e-1',
        'p-1'
      );
    });
  });

  describe('cancelEncounter', () => {
    it('cancels successfully', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findFirst.mockResolvedValue({ id: 'e-1', status: 'OPEN' });
      mockPrisma.clinicalEncounter.update.mockResolvedValue({ id: 'e-1', patient_id: 'p-1', status: 'CANCELLED' });
      await service.cancelEncounter('doc-user-1', 'e-1');
      expect(mockPrisma.clinicalEncounter.update).toHaveBeenCalled();
      expect(mockAudit.logEvent).toHaveBeenCalledWith(
        mockPrisma,
        'doc-user-1',
        'DOCTOR',
        'CLINICAL_ENCOUNTER_CANCELLED',
        'ClinicalEncounter',
        'e-1',
        'p-1'
      );
    });
  });

  describe('getEncounter', () => {
    it('fetches for patient', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 'p-1' });
      mockPrisma.clinicalEncounter.findFirst.mockResolvedValue({ id: 'e-1', patient_id: 'p-1' });
      await service.getEncounter('pat-user-1', AppRole.PATIENT, 'e-1');
      expect(mockPrisma.clinicalEncounter.findFirst).toHaveBeenCalledWith({ where: { id: 'e-1', patient_id: 'p-1' } });
      expect(mockAudit.logEvent).toHaveBeenCalled();
    });

    it('fetches for doctor', async () => {
      setupDoctor(true);
      mockPrisma.clinicalEncounter.findFirst.mockResolvedValue({ id: 'e-1', patient_id: 'p-1' });
      await service.getEncounter('doc-user-1', AppRole.DOCTOR, 'e-1');
      expect(mockPrisma.clinicalEncounter.findFirst).toHaveBeenCalledWith({ where: { id: 'e-1', doctor_id: 'd-1' } });
    });
  });

  describe('getEncounterByAppointment', () => {
    it('fetches for patient by appointment', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 'p-1' });
      mockPrisma.clinicalEncounter.findFirst.mockResolvedValue({ id: 'e-1', patient_id: 'p-1' });
      await service.getEncounterByAppointment('pat-user-1', AppRole.PATIENT, 'app-1');
      expect(mockPrisma.clinicalEncounter.findFirst).toHaveBeenCalledWith({ where: { appointment_id: 'app-1', patient_id: 'p-1' } });
    });
  });
});
