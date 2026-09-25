import { PatientsService } from './patients.service.js';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';

describe('PatientsService', () => {
  let service: PatientsService;
  let mockPrismaService: any;

  beforeEach(() => {
    mockPrismaService = {
      patient: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };
    service = new PatientsService(mockPrismaService);
  });

  it('should throw ConflictException on duplicate profile creation', async () => {
    mockPrismaService.patient.create.mockRejectedValue({ code: 'P2002' });
    await expect(service.createProfile('u-1', {})).rejects.toThrow(ConflictException);
  });

  it('should return profile on successful creation', async () => {
    mockPrismaService.patient.create.mockResolvedValue({ id: 'p-1' });
    const result = await service.createProfile('u-1', { city: 'Pune' });
    expect(result.id).toBe('p-1');
  });

  it('should throw NotFoundException if getting non-existent profile', async () => {
    mockPrismaService.patient.findUnique.mockResolvedValue(null);
    await expect(service.getProfile('u-1')).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException if updating non-existent profile', async () => {
    mockPrismaService.patient.update.mockRejectedValue({ code: 'P2025' });
    await expect(service.updateProfile('u-1', {})).rejects.toThrow(NotFoundException);
  });
});
