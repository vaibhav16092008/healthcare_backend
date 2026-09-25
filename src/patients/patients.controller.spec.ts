import { Test, TestingModule } from '@nestjs/testing';
import { PatientsController } from './patients.controller.js';
import { PatientsService } from './patients.service.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { UnauthorizedException } from '@nestjs/common';
import { vi } from 'vitest';

describe('PatientsController', () => {
  let controller: PatientsController;
  let service: PatientsService;

  beforeEach(async () => {
    const mockPatientsService = {
      createProfile: vi.fn(),
      getProfile: vi.fn(),
      updateProfile: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PatientsController],
      providers: [
        {
          provide: PatientsService,
          useValue: mockPatientsService,
        },
      ],
    })
      .overrideGuard(SupabaseAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PatientsController>(PatientsController);
    service = module.get<PatientsService>(PatientsService);
  });

  it('should throw UnauthorizedException if appUser is missing (Unauthenticated/Not onboarded)', async () => {
    await expect(controller.getProfile({ appUser: null })).rejects.toThrow(UnauthorizedException);
  });

  it('should call service.createProfile with internal user ID (Ownership enforcement)', async () => {
    const fakeUser = { appUser: { id: 'internal-id-123' } };
    const dto = {};
    vi.spyOn(service, 'createProfile').mockResolvedValue({ id: 'p-1', user_id: 'internal-id-123' } as any);
    
    await controller.createProfile(fakeUser, dto);
    expect(service.createProfile).toHaveBeenCalledWith('internal-id-123', dto);
  });

  it('should call service.getProfile with internal user ID', async () => {
    const fakeUser = { appUser: { id: 'internal-id-123' } };
    vi.spyOn(service, 'getProfile').mockResolvedValue({ id: 'p-1', user_id: 'internal-id-123' } as any);
    
    await controller.getProfile(fakeUser);
    expect(service.getProfile).toHaveBeenCalledWith('internal-id-123');
  });

  it('should call service.updateProfile with internal user ID', async () => {
    const fakeUser = { appUser: { id: 'internal-id-123' } };
    const dto = { city: 'New City' };
    vi.spyOn(service, 'updateProfile').mockResolvedValue({ id: 'p-1', user_id: 'internal-id-123' } as any);
    
    await controller.updateProfile(fakeUser, dto);
    expect(service.updateProfile).toHaveBeenCalledWith('internal-id-123', dto);
  });
});
