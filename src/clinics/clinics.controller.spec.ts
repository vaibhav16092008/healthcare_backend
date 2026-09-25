import { Test, TestingModule } from '@nestjs/testing';
import { ClinicsController } from './clinics.controller.js';
import { ClinicsService } from './clinics.service.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { RolesGuard } from '../auth/roles/roles.guard.js';
import { UnauthorizedException } from '@nestjs/common';
import { vi } from 'vitest';

describe('ClinicsController', () => {
  let controller: ClinicsController;
  let service: ClinicsService;

  beforeEach(async () => {
    const mockClinicsService = {
      createClinic: vi.fn(),
      getClinic: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClinicsController],
      providers: [
        {
          provide: ClinicsService,
          useValue: mockClinicsService,
        },
      ],
    })
      .overrideGuard(SupabaseAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ClinicsController>(ClinicsController);
    service = module.get<ClinicsService>(ClinicsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should throw UnauthorizedException if identity missing in extractAppUserId', () => {
    expect(() => controller.createClinic({ appUser: null }, { name: 'test' })).toThrow(UnauthorizedException);
  });

  it('should extract internal user id successfully', () => {
    controller.createClinic({ appUser: { id: 'u-1' } }, { name: 'test' });
    expect(service.createClinic).toHaveBeenCalledWith('u-1', { name: 'test' });
  });
});
