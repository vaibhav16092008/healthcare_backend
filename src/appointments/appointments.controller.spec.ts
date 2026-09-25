import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsController } from './appointments.controller.js';
import { AppointmentsService } from './appointments.service.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { RolesGuard } from '../auth/roles/roles.guard.js';
import { UnauthorizedException } from '@nestjs/common';
import { vi } from 'vitest';

describe('AppointmentsController', () => {
  let controller: AppointmentsController;
  let service: AppointmentsService;

  beforeEach(async () => {
    const mockService = {
      createAppointment: vi.fn(),
      getAvailability: vi.fn(),
      getPatientAppointments: vi.fn(),
      getDoctorAppointments: vi.fn(),
      getAppointmentById: vi.fn(),
      cancelAppointment: vi.fn(),
      completeAppointment: vi.fn(),
      markNoShow: vi.fn(),
      rescheduleAppointment: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppointmentsController],
      providers: [
        {
          provide: AppointmentsService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(SupabaseAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AppointmentsController>(AppointmentsController);
    service = module.get<AppointmentsService>(AppointmentsService);
  });

  it('should throw UnauthorizedException if identity missing in extractAppUserId', () => {
    expect(() => controller.createAppointment({ appUser: null }, { doctor_clinic_id: 'd-1', clinic_location_id: 'l-1', date: '2026-10-05', start_time: '10:00' })).toThrow(UnauthorizedException);
  });

  it('should call createAppointment correctly', () => {
    controller.createAppointment({ appUser: { id: 'u-1', role: 'PATIENT' } }, { doctor_clinic_id: 'd-1', clinic_location_id: 'l-1', date: '2026-10-05', start_time: '10:00' });
    expect(service.createAppointment).toHaveBeenCalledWith('u-1', { doctor_clinic_id: 'd-1', clinic_location_id: 'l-1', date: '2026-10-05', start_time: '10:00' });
  });

  it('should call getAvailability correctly', () => {
    controller.getAvailability('d-1', { clinic_location_id: 'l-1', date: '2026-10-05' });
    expect(service.getAvailability).toHaveBeenCalledWith('d-1', { clinic_location_id: 'l-1', date: '2026-10-05' }, 30);
  });

  it('should call cancelAppointment correctly', () => {
    controller.cancelAppointment({ appUser: { id: 'u-1', role: 'PATIENT' } }, 'app-1');
    expect(service.cancelAppointment).toHaveBeenCalledWith('u-1', 'PATIENT', 'app-1');
  });

  it('should call completeAppointment correctly', () => {
    controller.completeAppointment({ appUser: { id: 'u-1', role: 'DOCTOR' } }, 'app-1');
    expect(service.completeAppointment).toHaveBeenCalledWith('u-1', 'app-1');
  });

  it('should call markNoShow correctly', () => {
    controller.markNoShow({ appUser: { id: 'u-1', role: 'DOCTOR' } }, 'app-1');
    expect(service.markNoShow).toHaveBeenCalledWith('u-1', 'app-1');
  });

  it('should call rescheduleAppointment correctly', () => {
    controller.rescheduleAppointment({ appUser: { id: 'u-1', role: 'PATIENT' } }, 'app-1', { date: '2026-10-06', start_time: '10:00' });
    expect(service.rescheduleAppointment).toHaveBeenCalledWith('u-1', 'app-1', { date: '2026-10-06', start_time: '10:00' });
  });

  it('should call getPatientAppointments correctly', () => {
    controller.getPatientAppointments({ appUser: { id: 'u-1', role: 'PATIENT' } }, {});
    expect(service.getPatientAppointments).toHaveBeenCalledWith('u-1', {});
  });

  it('should call getDoctorAppointments correctly', () => {
    controller.getDoctorAppointments({ appUser: { id: 'u-1', role: 'DOCTOR' } }, {});
    expect(service.getDoctorAppointments).toHaveBeenCalledWith('u-1', {});
  });

  it('should call getAppointmentById correctly', () => {
    controller.getAppointmentById({ appUser: { id: 'u-1', role: 'PATIENT' } }, 'app-1');
    expect(service.getAppointmentById).toHaveBeenCalledWith('u-1', 'PATIENT', 'app-1');
  });
});
