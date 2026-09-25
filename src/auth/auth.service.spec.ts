import { AuthService } from './auth.service.js';
import { UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { vi } from 'vitest';

describe('AuthService', () => {
  let service: AuthService;
  let mockPrismaService: any;

  beforeEach(() => {
    mockPrismaService = {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
    };
    service = new AuthService(mockPrismaService);
  });

  it('should throw UnauthorizedException if client-provided email does not match JWT', async () => {
    await expect(
      service.onboardUser('sub-1', 'jwt@example.com', undefined, { email: 'hacker@example.com' })
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if client-provided phone does not match JWT', async () => {
    await expect(
      service.onboardUser('sub-1', undefined, '123', { phone: '999' })
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should create new user (Successful onboarding)', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(null);
    mockPrismaService.user.create.mockResolvedValue({ id: '1', auth_id: 'sub-1', email: 'jwt@example.com' });

    const result = await service.onboardUser('sub-1', 'jwt@example.com', undefined, { email: 'jwt@example.com' });
    expect(result.id).toEqual('1');
    expect(mockPrismaService.user.create).toHaveBeenCalledWith({
      data: {
        auth_id: 'sub-1',
        email: 'jwt@example.com',
        phone: undefined,
        status: 'ACTIVE',
      },
    });
  });

  it('should return existing user (Repeated onboarding)', async () => {
    const existing = { id: '1', auth_id: 'sub-1' };
    mockPrismaService.user.findUnique.mockResolvedValue(existing);

    const result = await service.onboardUser('sub-1', undefined, undefined, {});
    expect(result).toEqual(existing);
    expect(mockPrismaService.user.create).not.toHaveBeenCalled();
  });

  it('should handle P2002 race condition safely (Concurrent/duplicate onboarding protection)', async () => {
    mockPrismaService.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: '1', auth_id: 'sub-1' });

    mockPrismaService.user.create.mockRejectedValue({ code: 'P2002' });

    const result = await service.onboardUser('sub-1', undefined, undefined, {});
    expect(result.id).toEqual('1');
  });
});
