import { JwtStrategy } from './jwt.strategy.js';
import { UnauthorizedException } from '@nestjs/common';
import { vi } from 'vitest';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let mockConfigService: any;
  let mockPrismaService: any;

  beforeEach(() => {
    mockConfigService = { 
      get: vi.fn((key: string) => {
        if (key === 'SUPABASE_JWT_SECRET') return 'secret';
        if (key === 'SUPABASE_JWT_ISSUER') return 'issuer';
        if (key === 'SUPABASE_JWT_AUDIENCE') return 'audience';
        return null;
      })
    };
    mockPrismaService = {
      user: {
        findUnique: vi.fn(),
      },
    };
    strategy = new JwtStrategy(mockConfigService, mockPrismaService);
  });

  it('should initialize with correct validation parameters', () => {
    expect(strategy).toBeDefined();
  });

  it('should throw UnauthorizedException if JWT is missing sub (Missing JWT subject)', async () => {
    await expect(strategy.validate({ email: 'test@example.com' })).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if application account is SUSPENDED (Suspended user)', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({ status: 'SUSPENDED' });
    await expect(strategy.validate({ sub: 'auth-123' })).rejects.toThrow(UnauthorizedException);
  });

  it('should return valid identity with derived roles when valid token and account is ACTIVE (Valid token)', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({ 
      status: 'ACTIVE',
      admin: { id: 'admin-1' }, // User is an admin
      patient: null,
      doctor: null
    });
    const result = await strategy.validate({ sub: 'auth-123', email: 'test@test.com', phone: '123' });
    expect(result.authId).toEqual('auth-123');
    expect(result.email).toEqual('test@test.com');
    expect(result.phone).toEqual('123');
    expect(result.appUser?.status).toEqual('ACTIVE');
    expect(result.roles).toContain('ADMIN');
    expect(result.roles).not.toContain('PATIENT');
  });
});
