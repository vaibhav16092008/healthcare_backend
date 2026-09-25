import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from './roles.guard.js';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AppRole } from './roles.enum.js';
import { vi } from 'vitest';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesGuard, Reflector],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should allow access if no roles required', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null);
    expect(guard.canActivate({ getHandler: () => {}, getClass: () => {}, switchToHttp: () => ({ getRequest: () => ({}) }) } as any)).toBe(true);
  });

  it('should deny access if user has no roles', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([AppRole.ADMIN]);
    const ctx = {
      getHandler: () => {},
      getClass: () => {},
      switchToHttp: () => ({ getRequest: () => ({ user: {} }) }),
    } as any;

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should deny access if user lacks required role (e.g. PATIENT accessing ADMIN)', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([AppRole.ADMIN]);
    const ctx = {
      getHandler: () => {},
      getClass: () => {},
      switchToHttp: () => ({ getRequest: () => ({ user: { roles: [AppRole.PATIENT] } }) }),
    } as any;

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should allow access if user has required role (ADMIN accessing ADMIN)', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([AppRole.ADMIN]);
    const ctx = {
      getHandler: () => {},
      getClass: () => {},
      switchToHttp: () => ({ getRequest: () => ({ user: { roles: [AppRole.ADMIN] } }) }),
    } as any;

    expect(guard.canActivate(ctx)).toBe(true);
  });
});
