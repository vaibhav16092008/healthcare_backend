import { AvailabilityService } from './availability.service.js';
import { BadRequestException } from '@nestjs/common';
import { vi } from 'vitest';
import { OverrideType } from '../schedules/dto/create-schedule-override.dto.js';
import { DateTime } from 'luxon';

describe('AvailabilityService', () => {
  let service: AvailabilityService;
  let mockPrismaService: any;

  beforeEach(() => {
    mockPrismaService = {
      clinicLocation: { findUnique: vi.fn() },
      doctorClinic: { findUnique: vi.fn() },
      schedule: { findMany: vi.fn() },
      scheduleOverride: { findMany: vi.fn() },
      appointment: { findMany: vi.fn() },
    };
    service = new AvailabilityService(mockPrismaService);

    // Mock Date.now to test past slots correctly
    vi.setSystemTime(new Date('2026-10-05T08:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getAvailability', () => {
    it('should throw BadRequestException if doctor unverified', async () => {
      mockPrismaService.clinicLocation.findUnique.mockResolvedValue({ id: 'loc-1', clinic_id: 'c-1', timezone: 'UTC' });
      mockPrismaService.doctorClinic.findUnique.mockResolvedValue({ clinic_id: 'c-1', status: 'ACTIVE', doctor: { verification_status: 'PENDING' } });
      await expect(service.getAvailability('dc-1', 'loc-1', '2026-10-05')).rejects.toThrow(BadRequestException);
    });

    it('should generate slots correctly based on schedule', async () => {
      mockPrismaService.clinicLocation.findUnique.mockResolvedValue({ id: 'loc-1', clinic_id: 'c-1', timezone: 'UTC' });
      mockPrismaService.doctorClinic.findUnique.mockResolvedValue({ clinic_id: 'c-1', status: 'ACTIVE', doctor: { verification_status: 'VERIFIED' } });
      
      mockPrismaService.schedule.findMany.mockResolvedValue([
        { start_time: '09:00', end_time: '11:00', breaks: [] }
      ]);
      mockPrismaService.scheduleOverride.findMany.mockResolvedValue([]);
      mockPrismaService.appointment.findMany.mockResolvedValue([]);

      const slots = await service.getAvailability('dc-1', 'loc-1', '2026-10-06'); // Future date (06) compared to mocked now (05)
      expect(slots).toEqual([
        { start: '09:00', end: '09:30' },
        { start: '09:30', end: '10:00' },
        { start: '10:00', end: '10:30' },
        { start: '10:30', end: '11:00' },
      ]);
    });

    it('should remove slots overlapping with breaks', async () => {
      mockPrismaService.clinicLocation.findUnique.mockResolvedValue({ id: 'loc-1', clinic_id: 'c-1', timezone: 'UTC' });
      mockPrismaService.doctorClinic.findUnique.mockResolvedValue({ clinic_id: 'c-1', status: 'ACTIVE', doctor: { verification_status: 'VERIFIED' } });
      
      mockPrismaService.schedule.findMany.mockResolvedValue([
        { start_time: '09:00', end_time: '11:00', breaks: [{ start_time: '09:30', end_time: '10:00' }] }
      ]);
      mockPrismaService.scheduleOverride.findMany.mockResolvedValue([]);
      mockPrismaService.appointment.findMany.mockResolvedValue([]);

      const slots = await service.getAvailability('dc-1', 'loc-1', '2026-10-06');
      expect(slots).toEqual([
        { start: '09:00', end: '09:30' },
        { start: '10:00', end: '10:30' },
        { start: '10:30', end: '11:00' },
      ]);
    });

    it('should return empty if OVERRIDE UNAVAILABLE', async () => {
      mockPrismaService.clinicLocation.findUnique.mockResolvedValue({ id: 'loc-1', clinic_id: 'c-1', timezone: 'UTC' });
      mockPrismaService.doctorClinic.findUnique.mockResolvedValue({ clinic_id: 'c-1', status: 'ACTIVE', doctor: { verification_status: 'VERIFIED' } });
      
      mockPrismaService.schedule.findMany.mockResolvedValue([{ start_time: '09:00', end_time: '11:00', breaks: [] }]);
      mockPrismaService.scheduleOverride.findMany.mockResolvedValue([{ type: OverrideType.UNAVAILABLE }]);
      mockPrismaService.appointment.findMany.mockResolvedValue([]);

      const slots = await service.getAvailability('dc-1', 'loc-1', '2026-10-06');
      expect(slots).toEqual([]);
    });

    it('should respect CUSTOM_AVAILABILITY override', async () => {
      mockPrismaService.clinicLocation.findUnique.mockResolvedValue({ id: 'loc-1', clinic_id: 'c-1', timezone: 'UTC' });
      mockPrismaService.doctorClinic.findUnique.mockResolvedValue({ clinic_id: 'c-1', status: 'ACTIVE', doctor: { verification_status: 'VERIFIED' } });
      
      // Original schedule shouldn't matter
      mockPrismaService.schedule.findMany.mockResolvedValue([{ start_time: '09:00', end_time: '11:00', breaks: [] }]);
      mockPrismaService.scheduleOverride.findMany.mockResolvedValue([{ type: OverrideType.CUSTOM_AVAILABILITY, start_time: '14:00', end_time: '15:00' }]);
      mockPrismaService.appointment.findMany.mockResolvedValue([]);

      const slots = await service.getAvailability('dc-1', 'loc-1', '2026-10-06');
      expect(slots).toEqual([
        { start: '14:00', end: '14:30' },
        { start: '14:30', end: '15:00' },
      ]);
    });

    it('should filter out existing appointments', async () => {
      mockPrismaService.clinicLocation.findUnique.mockResolvedValue({ id: 'loc-1', clinic_id: 'c-1', timezone: 'UTC' });
      mockPrismaService.doctorClinic.findUnique.mockResolvedValue({ clinic_id: 'c-1', status: 'ACTIVE', doctor: { verification_status: 'VERIFIED' } });
      
      mockPrismaService.schedule.findMany.mockResolvedValue([{ start_time: '09:00', end_time: '11:00', breaks: [] }]);
      mockPrismaService.scheduleOverride.findMany.mockResolvedValue([]);
      
      // Mock existing appointment at 10:00 UTC
      mockPrismaService.appointment.findMany.mockResolvedValue([
        { start_at: new Date('2026-10-06T10:00:00Z'), end_at: new Date('2026-10-06T10:30:00Z') }
      ]);

      const slots = await service.getAvailability('dc-1', 'loc-1', '2026-10-06');
      expect(slots).toEqual([
        { start: '09:00', end: '09:30' },
        { start: '09:30', end: '10:00' },
        { start: '10:30', end: '11:00' },
      ]);
    });
  });
});
