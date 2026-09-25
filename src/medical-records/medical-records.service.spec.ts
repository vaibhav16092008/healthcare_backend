import { Test, TestingModule } from '@nestjs/testing';
import { MedicalRecordsService } from './medical-records.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { vi } from 'vitest';

import { MedicalDataAccessService } from '../medical-data-access/medical-data-access.service.js';
import { AuditService } from '../audit/audit.service.js';

describe('MedicalRecordsService', () => {
  let service: MedicalRecordsService;
  let mockPrisma: any;
  let mockStorage: any;
  let mockDataAccess: any;
  let mockAudit: any;

  beforeEach(async () => {
    mockPrisma = {
      patient: { findUnique: vi.fn() },
      doctor: { findUnique: vi.fn() },
      medicalRecord: {
        create: vi.fn(),
        count: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      medicalDocument: {
        create: vi.fn(),
        count: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      appointment: { findFirst: vi.fn() },
      $transaction: vi.fn().mockImplementation(async (cb) => {
        return cb(mockPrisma);
      }),
    };

    mockStorage = {
      createSignedUploadUrl: vi.fn().mockResolvedValue('http://upload.url'),
      createSignedDownloadUrl: vi.fn().mockResolvedValue('http://download.url'),
      verifyObjectExists: vi.fn().mockResolvedValue(true),
    };

    mockDataAccess = {
      verifyDoctorAccess: vi.fn().mockResolvedValue(true),
    };

    mockAudit = {
      logEvent: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MedicalRecordsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
        { provide: MedicalDataAccessService, useValue: mockDataAccess },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<MedicalRecordsService>(MedicalRecordsService);
  });

  describe('Patient access', () => {
    it('should create record if patient exists', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 'p-1' });
      mockPrisma.medicalRecord.create.mockResolvedValue({ id: 'r-1', title: 'Test' });

      const res = await service.createRecord('user-1', { title: 'Test' });
      expect(res.id).toBe('r-1');
      expect(mockPrisma.medicalRecord.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ patient_id: 'p-1' })
      }));
    });

    it('should throw NotFoundException if patient does not exist', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue(null);
      await expect(service.createRecord('user-1', { title: 'Test' })).rejects.toThrow(NotFoundException);
    });

    it('should delete record and cascade logically', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 'p-1' });
      mockPrisma.medicalRecord.findFirst.mockResolvedValue({ id: 'r-1' });

      await service.deleteRecord('user-1', 'r-1');

      expect(mockPrisma.medicalRecord.update).toHaveBeenCalledWith({
        where: { id: 'r-1' },
        data: { status: 'DELETED' },
      });
      expect(mockPrisma.medicalDocument.updateMany).toHaveBeenCalledWith({
        where: { medical_record_id: 'r-1' },
        data: { status: 'DELETED' },
      });
    });

    it('should create upload url and start as PENDING', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 'p-1' });
      mockPrisma.medicalRecord.findFirst.mockResolvedValue({ id: 'r-1' });
      mockPrisma.medicalDocument.create.mockResolvedValue({ id: 'doc-1', status: 'PENDING' });

      const res = await service.createDocumentUploadUrl('user-1', 'r-1', {
        original_filename: 'test.pdf',
        mime_type: 'application/pdf',
        file_size_bytes: 100,
      });

      expect(res.upload_url).toBe('http://upload.url');
      expect(mockPrisma.medicalDocument.create).toHaveBeenCalled();
      
      const createCall = mockPrisma.medicalDocument.create.mock.calls[0][0].data;
      expect(createCall.storage_object_path).toContain('patients/p-1/records/r-1/');
      expect(createCall.storage_object_path).toContain('.pdf');
      expect(createCall.status).toBe('PENDING');
    });

    it('should transition PENDING to ACTIVE on completeUpload if verified', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 'p-1' });
      mockPrisma.medicalDocument.findFirst.mockResolvedValue({ id: 'doc-1', status: 'PENDING', storage_object_path: 'path' });
      mockStorage.verifyObjectExists.mockResolvedValue(true);

      await service.completeDocumentUpload('user-1', 'doc-1');
      expect(mockPrisma.medicalDocument.update).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        data: { status: 'ACTIVE' },
        select: expect.any(Object),
      });
    });

    it('should fail completeUpload and remain PENDING if object verification fails', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 'p-1' });
      mockPrisma.medicalDocument.findFirst.mockResolvedValue({ id: 'doc-1', status: 'PENDING', storage_object_path: 'path' });
      mockStorage.verifyObjectExists.mockResolvedValue(false);

      await expect(service.completeDocumentUpload('user-1', 'doc-1')).rejects.toThrow(ConflictException);
      expect(mockPrisma.medicalDocument.update).not.toHaveBeenCalled();
    });

    it('should not allow completeUpload if already active or missing', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 'p-1' });
      mockPrisma.medicalDocument.findFirst.mockResolvedValue(null);

      await expect(service.completeDocumentUpload('user-1', 'doc-1')).rejects.toThrow(NotFoundException);
    });

    it('should not allow downloading deleted or pending document', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 'p-1' });
      mockPrisma.medicalDocument.findFirst.mockResolvedValue(null); // Document not found (or not ACTIVE)

      await expect(service.getDownloadUrlForPatient('user-1', 'doc-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('Doctor access', () => {
    it('should allow access if grant exists', async () => {
      mockPrisma.doctor.findUnique.mockResolvedValue({ id: 'd-1', verification_status: 'VERIFIED' });
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 'p-1' });
      mockDataAccess.verifyDoctorAccess.mockResolvedValue(true);
      mockPrisma.medicalRecord.count.mockResolvedValue(1);
      mockPrisma.medicalRecord.findMany.mockResolvedValue([{ id: 'r-1' }]);

      const res = await service.getRecordsForDoctor('doc-user', 'pat-user');
      expect(res.data.length).toBe(1);
      expect(mockDataAccess.verifyDoctorAccess).toHaveBeenCalledWith('d-1', 'p-1');
    });

    it('should deny access if no grant exists', async () => {
      mockPrisma.doctor.findUnique.mockResolvedValue({ id: 'd-1', verification_status: 'VERIFIED' });
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 'p-1' });
      mockDataAccess.verifyDoctorAccess.mockResolvedValue(false);

      await expect(service.getRecordsForDoctor('doc-user', 'pat-user')).rejects.toThrow(ForbiddenException);
    });
  });
});
