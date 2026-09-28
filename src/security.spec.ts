import { Test, TestingModule } from '@nestjs/testing';
import { MedicalRecordsService } from './medical-records/medical-records.service.js';
import { AppointmentsService } from './appointments/appointments.service.js';
import { PrismaService } from './prisma/prisma.service.js';
import { StorageService } from './storage/storage.service.js';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { vi } from 'vitest';
import { MedicalDataAccessService } from './medical-data-access/medical-data-access.service.js';
import { AuditService } from './audit/audit.service.js';
import { AvailabilityService } from './appointments/availability.service.js';

describe('Security Regression Tests', () => {
  let recordsService: MedicalRecordsService;
  let appointmentsService: AppointmentsService;
  let mockPrisma: any;
  let mockDataAccess: any;

  beforeEach(async () => {
    mockPrisma = {
      patient: { findUnique: vi.fn() },
      doctor: { findUnique: vi.fn() },
      medicalRecord: {
        findFirst: vi.fn(),
      },
      appointment: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation(async (cb) => cb(mockPrisma)),
    };

    mockDataAccess = {
      verifyDoctorAccess: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MedicalRecordsService,
        AppointmentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: { verifyObjectExists: vi.fn() } },
        { provide: MedicalDataAccessService, useValue: mockDataAccess },
        { provide: AuditService, useValue: { logEvent: vi.fn() } },
        { provide: AvailabilityService, useValue: { getAvailability: vi.fn() } },
      ],
    }).compile();

    recordsService = module.get<MedicalRecordsService>(MedicalRecordsService);
    appointmentsService = module.get<AppointmentsService>(AppointmentsService);
  });

  describe('PATIENT SECURITY', () => {
    it('PATIENT: cannot access another patient\'s record (IDOR Blocked)', async () => {
      // Mock patient fetching
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 'patient-1' });
      
      // Simulate that the DB query for the record (which enforces patient_id = patient-1) returns null
      // because the record actually belongs to patient-2
      mockPrisma.medicalRecord.findFirst.mockResolvedValue(null);

      await expect(recordsService.getRecordById('user-patient-1', 'record-patient-2'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('DOCTOR SECURITY', () => {
    it('DOCTOR: cannot access unauthorized patient\'s records (No Grant)', async () => {
      mockPrisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1', verification_status: 'VERIFIED' });
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 'patient-1' });
      
      // Mock DataAccessService returning false (no grant exists)
      mockDataAccess.verifyDoctorAccess.mockResolvedValue(false);

      await expect(recordsService.getRecordsForDoctor('user-doc-1', 'user-patient-1'))
        .rejects.toThrow(ForbiddenException);
    });

    it('DOCTOR: cannot access another doctor\'s appointment', async () => {
      mockPrisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      
      // Mock an appointment that belongs to doc-2's clinic
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-1',
        doctorClinic: { doctor_id: 'doc-2' }
      });

      await expect(appointmentsService.getAppointmentById('user-doc-1', 'DOCTOR', 'appt-1'))
        .rejects.toThrow(NotFoundException);
    });
  });
});
