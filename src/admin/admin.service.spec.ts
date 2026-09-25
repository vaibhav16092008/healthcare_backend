import { AdminService } from './admin.service.js';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';
import { VerificationStatus } from './dto/update-doctor-verification.dto.js';

describe('AdminService', () => {
  let service: AdminService;
  let mockPrismaService: any;

  beforeEach(() => {
    mockPrismaService = {
      doctor: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };
    service = new AdminService(mockPrismaService);
  });

  it('should throw NotFoundException if doctor does not exist', async () => {
    mockPrismaService.doctor.findUnique.mockResolvedValue(null);
    await expect(service.updateDoctorVerification('doc-1', { status: VerificationStatus.VERIFIED })).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException if transition is not from PENDING', async () => {
    mockPrismaService.doctor.findUnique.mockResolvedValue({ id: 'doc-1', verification_status: 'VERIFIED' });
    await expect(service.updateDoctorVerification('doc-1', { status: VerificationStatus.REJECTED })).rejects.toThrow(ConflictException);
  });

  it('should successfully update status from PENDING to VERIFIED', async () => {
    mockPrismaService.doctor.findUnique.mockResolvedValue({ id: 'doc-1', verification_status: 'PENDING' });
    mockPrismaService.doctor.update.mockResolvedValue({ id: 'doc-1', verification_status: 'VERIFIED' });
    
    const result = await service.updateDoctorVerification('doc-1', { status: VerificationStatus.VERIFIED });
    expect(result.verification_status).toBe('VERIFIED');
    expect(mockPrismaService.doctor.update).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      data: { verification_status: 'VERIFIED' },
      select: expect.any(Object),
    });
  });
});
