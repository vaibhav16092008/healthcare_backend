import { ClinicsService } from './clinics.service.js';
import { ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { vi } from 'vitest';

describe('ClinicsService', () => {
  let service: ClinicsService;
  let mockPrismaService: any;

  beforeEach(() => {
    mockPrismaService = {
      doctor: { findUnique: vi.fn() },
      clinic: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
      clinicLocation: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
      doctorClinic: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    };
    service = new ClinicsService(mockPrismaService);
  });

  describe('Clinic Creation', () => {
    it('should deny clinic creation to unverified doctors', async () => {
      mockPrismaService.doctor.findUnique.mockResolvedValue({ verification_status: 'PENDING' });
      await expect(service.createClinic('u-1', { name: 'Test' })).rejects.toThrow(ForbiddenException);
    });

    it('should allow clinic creation to verified doctors', async () => {
      mockPrismaService.doctor.findUnique.mockResolvedValue({ verification_status: 'VERIFIED' });
      mockPrismaService.clinic.create.mockResolvedValue({ id: 'c-1', owner_id: 'u-1', name: 'Test' });
      const result = await service.createClinic('u-1', { name: 'Test' });
      expect(result.id).toEqual('c-1');
    });
  });

  describe('Location Management', () => {
    it('should deny location creation if not owner', async () => {
      mockPrismaService.clinic.findUnique.mockResolvedValue({ owner_id: 'u-2' });
      await expect(service.createLocation('u-1', 'c-1', {} as any)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Practice Relationships', () => {
    it('should deny practice relationship creation to unverified doctors', async () => {
      mockPrismaService.doctor.findUnique.mockResolvedValue({ verification_status: 'PENDING' });
      await expect(service.addMyPractice('u-1', { clinic_id: 'c-1' })).rejects.toThrow(ForbiddenException);
    });

    it('should safely catch duplicate relationships', async () => {
      mockPrismaService.doctor.findUnique.mockResolvedValue({ id: 'doc-1', verification_status: 'VERIFIED' });
      mockPrismaService.clinic.findUnique.mockResolvedValue({ id: 'c-1', status: 'ACTIVE' });
      mockPrismaService.doctorClinic.create.mockRejectedValue({ code: 'P2002' });
      
      await expect(service.addMyPractice('u-1', { clinic_id: 'c-1' })).rejects.toThrow(ConflictException);
    });

    it('should deny joining an INACTIVE clinic', async () => {
      mockPrismaService.doctor.findUnique.mockResolvedValue({ id: 'doc-1', verification_status: 'VERIFIED' });
      mockPrismaService.clinic.findUnique.mockResolvedValue({ id: 'c-1', status: 'INACTIVE' });
      
      await expect(service.addMyPractice('u-1', { clinic_id: 'c-1' })).rejects.toThrow(ForbiddenException);
    });
  });
});
