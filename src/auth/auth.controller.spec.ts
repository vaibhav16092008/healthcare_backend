import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { UnauthorizedException } from '@nestjs/common';
import { SupabaseAuthGuard } from './supabase.guard.js';
import { vi } from 'vitest';

describe('AuthController', () => {
  let controller: AuthController;
  let service: AuthService;

  beforeEach(async () => {
    const mockAuthService = {
      onboardUser: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    })
      .overrideGuard(SupabaseAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should throw UnauthorizedException if authId is missing from CurrentUser', async () => {
    const fakeUser = {}; 
    const dto = { email: 'test@example.com' };

    await expect(controller.onboard(fakeUser, dto)).rejects.toThrow(UnauthorizedException);
  });

  it('should call authService.onboardUser if token is valid', async () => {
    const fakeUser = { authId: 'test-uuid-123', email: 'test@example.com', phone: undefined };
    const dto = { email: 'test@example.com' };
    const mockResult = { id: 'db-id', auth_id: 'test-uuid-123', status: 'ACTIVE' };

    vi.spyOn(service, 'onboardUser').mockResolvedValue(mockResult as any);

    const result = await controller.onboard(fakeUser, dto);
    expect(result).toEqual(mockResult);
    expect(service.onboardUser).toHaveBeenCalledWith('test-uuid-123', 'test@example.com', undefined, dto);
  });
});
