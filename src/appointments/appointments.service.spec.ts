import { AppointmentsService } from './appointments.service.js';
import { AvailabilityService } from './availability.service.js';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { vi } from 'vitest';

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let mockPrismaService: any;
  let mockAvailabilityService: any;

  beforeEach(() => {
    mockPrismaService = {
      patient: { findUnique: vi.fn() },
      doctor: { findUnique: vi.fn() },
      clinicLocation: { findUnique: vi.fn() },
      appointment: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
      $transaction: vi.fn(async (callback, options) => {
        return callback(mockPrismaService);
      }),
    };

    mockAvailabilityService = {
      getAvailability: vi.fn(),
      resolveAbsoluteTime: vi.fn(),
    };

    service = new AppointmentsService(mockPrismaService, mockAvailabilityService);
  });

  describe('getAppointmentById (Authorization)', () => {
    it('Patient can access own appointment', async () => {
      mockPrismaService.appointment.findUnique.mockResolvedValue({ id: 'app-1', patient_id: 'p-1' });
      mockPrismaService.patient.findUnique.mockResolvedValue({ id: 'p-1' });
      const res = await service.getAppointmentById('u-1', 'PATIENT', 'app-1');
      expect(res.id).toEqual('app-1');
    });

    it('Patient cannot access another patient appointment', async () => {
      mockPrismaService.appointment.findUnique.mockResolvedValue({ id: 'app-1', patient_id: 'p-2' });
      mockPrismaService.patient.findUnique.mockResolvedValue({ id: 'p-1' });
      await expect(service.getAppointmentById('u-1', 'PATIENT', 'app-1')).rejects.toThrow(NotFoundException);
    });

    it('Doctor can access appointment from own DoctorClinic', async () => {
      mockPrismaService.appointment.findUnique.mockResolvedValue({ id: 'app-1', doctorClinic: { doctor_id: 'd-1' } });
      mockPrismaService.doctor.findUnique.mockResolvedValue({ id: 'd-1' });
      const res = await service.getAppointmentById('u-1', 'DOCTOR', 'app-1');
      expect(res.id).toEqual('app-1');
    });

    it('Doctor cannot access another doctor appointment', async () => {
      mockPrismaService.appointment.findUnique.mockResolvedValue({ id: 'app-1', doctorClinic: { doctor_id: 'd-2' } });
      mockPrismaService.doctor.findUnique.mockResolvedValue({ id: 'd-1' });
      await expect(service.getAppointmentById('u-1', 'DOCTOR', 'app-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelAppointment', () => {
    it('should transition BOOKED to CANCELLED', async () => {
      mockPrismaService.appointment.findUnique.mockResolvedValue({ id: 'app-1', patient_id: 'p-1', status: AppointmentStatus.BOOKED });
      mockPrismaService.patient.findUnique.mockResolvedValue({ id: 'p-1' });
      mockPrismaService.appointment.update.mockResolvedValue({ id: 'app-1', status: AppointmentStatus.CANCELLED });
      
      const res = await service.cancelAppointment('u-1', 'PATIENT', 'app-1');
      expect(res.status).toEqual(AppointmentStatus.CANCELLED);
    });

    it('should throw Conflict if already CANCELLED', async () => {
      mockPrismaService.appointment.findUnique.mockResolvedValue({ id: 'app-1', patient_id: 'p-1', status: AppointmentStatus.CANCELLED });
      mockPrismaService.patient.findUnique.mockResolvedValue({ id: 'p-1' });
      
      await expect(service.cancelAppointment('u-1', 'PATIENT', 'app-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('completeAppointment', () => {
    it('Doctor can complete BOOKED appointment', async () => {
      mockPrismaService.appointment.findUnique.mockResolvedValue({ id: 'app-1', doctorClinic: { doctor_id: 'd-1' }, status: AppointmentStatus.BOOKED });
      mockPrismaService.doctor.findUnique.mockResolvedValue({ id: 'd-1' });
      mockPrismaService.appointment.update.mockResolvedValue({ id: 'app-1', status: AppointmentStatus.COMPLETED });

      const res = await service.completeAppointment('u-1', 'app-1');
      expect(res.status).toEqual(AppointmentStatus.COMPLETED);
    });
  });

  describe('markNoShow', () => {
    it('Doctor can mark NO_SHOW', async () => {
      mockPrismaService.appointment.findUnique.mockResolvedValue({ id: 'app-1', doctorClinic: { doctor_id: 'd-1' }, status: AppointmentStatus.BOOKED });
      mockPrismaService.doctor.findUnique.mockResolvedValue({ id: 'd-1' });
      mockPrismaService.appointment.update.mockResolvedValue({ id: 'app-1', status: AppointmentStatus.NO_SHOW });

      const res = await service.markNoShow('u-1', 'app-1');
      expect(res.status).toEqual(AppointmentStatus.NO_SHOW);
    });
  });

  describe('rescheduleAppointment', () => {
    it('Patient can reschedule own BOOKED appointment', async () => {
      mockPrismaService.appointment.findUnique
        // first for getAppointmentById
        .mockResolvedValueOnce({ id: 'app-1', patient_id: 'p-1', status: AppointmentStatus.BOOKED, doctor_clinic_id: 'dc-1', clinic_location_id: 'loc-1' })
        // second for transaction status check
        .mockResolvedValueOnce({ id: 'app-1', patient_id: 'p-1', status: AppointmentStatus.BOOKED, doctor_clinic_id: 'dc-1', clinic_location_id: 'loc-1' });
      mockPrismaService.patient.findUnique.mockResolvedValue({ id: 'p-1' });
      mockPrismaService.clinicLocation.findUnique.mockResolvedValue({ id: 'loc-1', timezone: 'UTC' });
      
      mockAvailabilityService.getAvailability.mockResolvedValue([{ start: '10:00', end: '10:30' }]);
      mockAvailabilityService.resolveAbsoluteTime.mockReturnValue(new Date());

      mockPrismaService.appointment.findMany.mockResolvedValue([]); // No overlaps
      mockPrismaService.appointment.update.mockResolvedValue({ id: 'app-1' });

      const res = await service.rescheduleAppointment('u-1', 'app-1', { date: '2026-10-06', start_time: '10:00' });
      expect(res.id).toEqual('app-1');
    });

    it('Rescheduling to occupied slot returns 409', async () => {
      mockPrismaService.appointment.findUnique
        .mockResolvedValue({ id: 'app-1', patient_id: 'p-1', status: AppointmentStatus.BOOKED, doctor_clinic_id: 'dc-1', clinic_location_id: 'loc-1' });
      mockPrismaService.patient.findUnique.mockResolvedValue({ id: 'p-1' });
      mockPrismaService.clinicLocation.findUnique.mockResolvedValue({ id: 'loc-1', timezone: 'UTC' });
      
      mockAvailabilityService.getAvailability.mockResolvedValue([{ start: '10:00', end: '10:30' }]);
      mockAvailabilityService.resolveAbsoluteTime.mockReturnValue(new Date());

      mockPrismaService.appointment.findMany.mockResolvedValue([{ id: 'other-app' }]); // overlap inside transaction!

      await expect(service.rescheduleAppointment('u-1', 'app-1', { date: '2026-10-06', start_time: '10:00' })).rejects.toThrow(ConflictException);
    });

    it('Rescheduling completed appointment fails', async () => {
      mockPrismaService.appointment.findUnique.mockResolvedValue({ id: 'app-1', patient_id: 'p-1', status: AppointmentStatus.COMPLETED });
      mockPrismaService.patient.findUnique.mockResolvedValue({ id: 'p-1' });

      await expect(service.rescheduleAppointment('u-1', 'app-1', { date: '2026-10-06', start_time: '10:00' })).rejects.toThrow(ConflictException);
    });
  });

  describe('createAppointment', () => {
    it('should retry on serialization failure (P2034) and eventually succeed', async () => {
      mockPrismaService.patient.findUnique.mockResolvedValue({ id: 'p-1' });
      mockPrismaService.clinicLocation.findUnique.mockResolvedValue({ id: 'loc-1', timezone: 'UTC' });
      mockAvailabilityService.getAvailability.mockResolvedValue([{ start: '09:00', end: '09:30' }]);
      mockPrismaService.appointment.findMany.mockResolvedValue([]);

      const error = new Error('conflict');
      (error as any).code = 'P2034';

      mockPrismaService.appointment.create
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ id: 'app-1' });

      const res = await service.createAppointment('u-1', {
        doctor_clinic_id: 'dc-1',
        clinic_location_id: 'loc-1',
        date: '2026-10-05',
        start_time: '09:00'
      });

      expect(res.id).toEqual('app-1');
      expect(mockPrismaService.appointment.create).toHaveBeenCalledTimes(2);
    });
  });
});
