import { DoctorsService } from './doctors.service.js';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';

describe('DoctorsService', () => {
  let service: DoctorsService;
  let mockPrismaService: any;

  beforeEach(() => {
    mockPrismaService = {
      doctor: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
        findMany: vi.fn(),
      },
    };
    service = new DoctorsService(mockPrismaService);
  });

  describe('createProfile / updateProfile / getProfile', () => {
    it('should throw ConflictException on duplicate profile creation', async () => {
      mockPrismaService.doctor.create.mockRejectedValue({ code: 'P2002' });
      const dto = { specialization: 'G', experience_years: 1, registration_number: 'R1', medical_council_name: 'M', registration_year: 2020 };
      await expect(service.createProfile('u-1', dto)).rejects.toThrow(ConflictException);
    });

    it('should return profile on successful creation', async () => {
      mockPrismaService.doctor.create.mockResolvedValue({ id: 'd-1' });
      const dto = { specialization: 'G', experience_years: 1, registration_number: 'R1', medical_council_name: 'M', registration_year: 2020 };
      const result = await service.createProfile('u-1', dto);
      expect(result.id).toBe('d-1');
    });

    it('should throw NotFoundException if getting non-existent profile', async () => {
      mockPrismaService.doctor.findUnique.mockResolvedValue(null);
      await expect(service.getProfile('u-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if updating non-existent profile', async () => {
      mockPrismaService.doctor.update.mockRejectedValue({ code: 'P2025' });
      await expect(service.updateProfile('u-1', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('searchDoctors (Discovery)', () => {
    it('should return paginated VERIFIED doctors with mapped response', async () => {
      mockPrismaService.doctor.count.mockResolvedValue(1);
      mockPrismaService.doctor.findMany.mockResolvedValue([
        {
          id: 'doc-1',
          specialization: 'Cardiology',
          experience_years: 10,
          bio: 'Great doctor',
          consultation_fee: 500,
          verification_status: 'VERIFIED',
          clinics: [
            {
              clinic: {
                id: 'clinic-1',
                name: 'Heart Clinic',
                locations: [
                  {
                    id: 'loc-1',
                    city: 'Mumbai',
                    state: 'MH',
                    postal_code: '400001',
                    timezone: 'Asia/Kolkata',
                  },
                ],
              },
            },
          ],
        },
      ]);

      const result = await service.searchDoctors({ page: 1, limit: 10, city: 'Mumbai' });
      
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.total_pages).toBe(1);
      expect(result.data.length).toBe(1);
      
      const doc = result.data[0];
      expect(doc.id).toBe('doc-1');
      expect(doc.verification_status).toBe('VERIFIED');
      expect(doc.clinics[0].name).toBe('Heart Clinic');
      expect(doc.clinics[0].locations[0].city).toBe('Mumbai');
    });

    it('should pass correct filters to prisma including city and active statuses', async () => {
      mockPrismaService.doctor.count.mockResolvedValue(0);
      mockPrismaService.doctor.findMany.mockResolvedValue([]);

      await service.searchDoctors({ city: 'Delhi', specialization: 'Dentist' });

      // Verify count was called with correct structure enforcing verification and active clinics
      const countCall = mockPrismaService.doctor.count.mock.calls[0][0];
      expect(countCall.where.verification_status).toBe('VERIFIED');
      expect(countCall.where.user.status).toBe('ACTIVE');
      expect(countCall.where.specialization.equals).toBe('Dentist');
      
      // Verify clinic structure deep filter
      const clinicSome = countCall.where.clinics.some;
      expect(clinicSome.status).toBe('ACTIVE');
      expect(clinicSome.clinic.locations.some.city.equals).toBe('Delhi');
    });
  });
});
