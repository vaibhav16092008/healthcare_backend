import { Test, TestingModule } from '@nestjs/testing';
import { SchedulesController } from './schedules.controller.js';
import { SchedulesService } from './schedules.service.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { RolesGuard } from '../auth/roles/roles.guard.js';
import { UnauthorizedException } from '@nestjs/common';
import { vi } from 'vitest';

describe('SchedulesController', () => {
  let controller: SchedulesController;
  let service: SchedulesService;

  beforeEach(async () => {
    const mockService = {
      createSchedule: vi.fn(),
      getScheduleById: vi.fn(),
      updateSchedule: vi.fn(),
      getBreakById: vi.fn(),
      updateBreak: vi.fn(),
      getOverrideById: vi.fn(),
      updateOverride: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchedulesController],
      providers: [
        {
          provide: SchedulesService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(SupabaseAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SchedulesController>(SchedulesController);
    service = module.get<SchedulesService>(SchedulesService);
  });

  it('should throw UnauthorizedException if identity missing in extractAppUserId', () => {
    expect(() => controller.createSchedule({ appUser: null }, { clinic_location_id: 'l-1' } as any)).toThrow(UnauthorizedException);
  });

  it('should call updateSchedule correctly', () => {
    controller.updateSchedule({ appUser: { id: 'u-1' } }, 's-1', { start_time: '10:00' });
    expect(service.updateSchedule).toHaveBeenCalledWith('u-1', 's-1', { start_time: '10:00' });
  });

  it('should call getScheduleById correctly', () => {
    controller.getScheduleById({ appUser: { id: 'u-1' } }, 's-1');
    expect(service.getScheduleById).toHaveBeenCalledWith('u-1', 's-1');
  });
});
