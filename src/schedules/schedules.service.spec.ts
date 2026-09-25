import { SchedulesService } from './schedules.service.js';
import { ForbiddenException, NotFoundException, ConflictException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { vi } from 'vitest';

describe('SchedulesService', () => {
  let service: SchedulesService;
  let mockPrismaService: any;

  beforeEach(() => {
    mockPrismaService = {
      doctor: { findUnique: vi.fn() },
      clinicLocation: { findUnique: vi.fn() },
      doctorClinic: { findUnique: vi.fn() },
      schedule: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
      scheduleBreak: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
      scheduleOverride: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
      // Mock $transaction directly executing callback
      $transaction: vi.fn(async (callback, options) => {
        return callback(mockPrismaService);
      }),
    };
    service = new SchedulesService(mockPrismaService);
  });

  describe('Concurrency & Serialization Retry', () => {
    it('should retry on P2034 serialization failure and succeed', async () => {
      mockPrismaService.doctor.findUnique.mockResolvedValue({ id: 'doc-1', verification_status: 'VERIFIED' });
      mockPrismaService.clinicLocation.findUnique.mockResolvedValue({ clinic_id: 'c-1' });
      mockPrismaService.doctorClinic.findUnique.mockResolvedValue({ id: 'dc-1', status: 'ACTIVE' });
      mockPrismaService.schedule.findMany.mockResolvedValue([]);
      
      const error = new Error('conflict');
      (error as any).code = 'P2034';
      
      // Fail twice, succeed third time
      mockPrismaService.schedule.create
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ id: 's-new' });

      const res = await service.createSchedule('u-1', { clinic_location_id: 'l-1', day_of_week: 'MONDAY' as any, start_time: '09:00', end_time: '12:00' });
      expect(res.id).toEqual('s-new');
      expect(mockPrismaService.schedule.create).toHaveBeenCalledTimes(3);
    });

    it('should throw InternalServerErrorException if all retries fail', async () => {
      mockPrismaService.doctor.findUnique.mockResolvedValue({ id: 'doc-1', verification_status: 'VERIFIED' });
      mockPrismaService.clinicLocation.findUnique.mockResolvedValue({ clinic_id: 'c-1' });
      mockPrismaService.doctorClinic.findUnique.mockResolvedValue({ id: 'dc-1', status: 'ACTIVE' });
      mockPrismaService.schedule.findMany.mockResolvedValue([]);
      
      const error = new Error('conflict');
      (error as any).code = 'P2034';
      
      mockPrismaService.schedule.create.mockRejectedValue(error);

      await expect(service.createSchedule('u-1', { clinic_location_id: 'l-1', day_of_week: 'MONDAY' as any, start_time: '09:00', end_time: '12:00' }))
        .rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('IDOR & Ownership', () => {
    it('should throw NotFoundException on getScheduleById for unauthorized doctor (IDOR)', async () => {
      mockPrismaService.doctor.findUnique.mockResolvedValue({ id: 'doc-2', verification_status: 'VERIFIED' });
      mockPrismaService.schedule.findUnique.mockResolvedValue({ 
        id: 's-1',
        doctorClinic: { doctor_id: 'doc-1' } // Belongs to different doctor
      });

      await expect(service.getScheduleById('u-2', 's-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException on updateSchedule for unauthorized doctor', async () => {
      mockPrismaService.doctor.findUnique.mockResolvedValue({ id: 'doc-2', verification_status: 'VERIFIED' });
      mockPrismaService.schedule.findUnique.mockResolvedValue({ 
        id: 's-1',
        doctorClinic: { doctor_id: 'doc-1' }
      });

      await expect(service.updateSchedule('u-2', 's-1', { start_time: '10:00' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('Update Validations', () => {
    it('should allow valid schedule update', async () => {
      mockPrismaService.doctor.findUnique.mockResolvedValue({ id: 'doc-1', verification_status: 'VERIFIED' });
      mockPrismaService.schedule.findUnique.mockResolvedValue({ 
        id: 's-1',
        clinic_location_id: 'loc-1',
        day_of_week: 'MONDAY',
        start_time: '09:00',
        end_time: '12:00',
        status: 'ACTIVE',
        doctor_clinic_id: 'dc-1',
        doctorClinic: { doctor_id: 'doc-1', status: 'ACTIVE' }
      });
      mockPrismaService.schedule.findMany.mockResolvedValue([]);
      mockPrismaService.scheduleBreak.findMany.mockResolvedValue([]);
      mockPrismaService.schedule.update.mockResolvedValue({ id: 's-1' });

      const res = await service.updateSchedule('u-1', 's-1', { start_time: '10:00' });
      expect(res.id).toEqual('s-1');
    });

    it('should block schedule update if overlap occurs', async () => {
      mockPrismaService.doctor.findUnique.mockResolvedValue({ id: 'doc-1', verification_status: 'VERIFIED' });
      mockPrismaService.schedule.findUnique.mockResolvedValue({ 
        id: 's-1',
        clinic_location_id: 'loc-1',
        day_of_week: 'MONDAY',
        start_time: '09:00',
        end_time: '12:00',
        status: 'ACTIVE',
        doctor_clinic_id: 'dc-1',
        doctorClinic: { doctor_id: 'doc-1', status: 'ACTIVE' }
      });
      // Existing schedule that overlaps with proposed 10:00-12:00
      mockPrismaService.schedule.findMany.mockResolvedValue([{ start_time: '09:30', end_time: '10:30' }]);

      await expect(service.updateSchedule('u-1', 's-1', { start_time: '10:00' })).rejects.toThrow(ConflictException);
    });
  });
});
