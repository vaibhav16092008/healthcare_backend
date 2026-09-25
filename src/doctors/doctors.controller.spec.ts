import { Test, TestingModule } from '@nestjs/testing';
import { DoctorsController, PublicDoctorsController } from './doctors.controller.js';
import { DoctorsService } from './doctors.service.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { RolesGuard } from '../auth/roles/roles.guard.js';
import { UnauthorizedException } from '@nestjs/common';
import { vi } from 'vitest';

describe('DoctorsController & PublicDoctorsController', () => {
  let controller: DoctorsController;
  let publicController: PublicDoctorsController;
  let service: DoctorsService;

  beforeEach(async () => {
    const mockDoctorsService = {
      createProfile: vi.fn(),
      getProfile: vi.fn(),
      updateProfile: vi.fn(),
      searchDoctors: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DoctorsController, PublicDoctorsController],
      providers: [
        {
          provide: DoctorsService,
          useValue: mockDoctorsService,
        },
      ],
    })
      .overrideGuard(SupabaseAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DoctorsController>(DoctorsController);
    publicController = module.get<PublicDoctorsController>(PublicDoctorsController);
    service = module.get<DoctorsService>(DoctorsService);
  });

  describe('DoctorsController', () => {
    it('should throw UnauthorizedException if appUser is missing (Unauthenticated/Not onboarded)', async () => {
      await expect(controller.getProfile({ appUser: null })).rejects.toThrow(UnauthorizedException);
    });

    it('should call service.createProfile with internal user ID (Ownership enforcement)', async () => {
      const fakeUser = { appUser: { id: 'internal-id-123' } };
      const dto = { specialization: 'General', experience_years: 5, registration_number: 'R1', medical_council_name: 'M1', registration_year: 2020 };
      vi.spyOn(service, 'createProfile').mockResolvedValue({ id: 'd-1', user_id: 'internal-id-123' } as any);
      
      await controller.createProfile(fakeUser, dto as any);
      expect(service.createProfile).toHaveBeenCalledWith('internal-id-123', dto);
    });

    it('should call service.updateProfile with internal user ID', async () => {
      const fakeUser = { appUser: { id: 'internal-id-123' } };
      const dto = { experience_years: 6 };
      vi.spyOn(service, 'updateProfile').mockResolvedValue({ id: 'd-1', user_id: 'internal-id-123' } as any);
      
      await controller.updateProfile(fakeUser, dto as any);
      expect(service.updateProfile).toHaveBeenCalledWith('internal-id-123', dto);
    });
  });

  describe('PublicDoctorsController', () => {
    it('should call searchDoctors on the service', async () => {
      const query = { page: 2, limit: 10, city: 'Mumbai' };
      vi.spyOn(service, 'searchDoctors').mockResolvedValue({ data: [], pagination: { page: 2, limit: 10, total: 0, total_pages: 0 } });
      
      const result = await publicController.searchDoctors(query);
      
      expect(service.searchDoctors).toHaveBeenCalledWith(query);
      expect(result.pagination.page).toBe(2);
    });
  });
});
