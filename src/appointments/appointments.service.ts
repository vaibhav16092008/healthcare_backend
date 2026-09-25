import { Injectable, ForbiddenException, NotFoundException, ConflictException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma, AppointmentStatus } from '@prisma/client';
import { CreateAppointmentDto } from './dto/create-appointment.dto.js';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto.js';
import { AppointmentListQueryDto } from './dto/appointment-list-query.dto.js';
import { AvailabilityService } from './availability.service.js';
import { DEFAULT_APPOINTMENT_DURATION_MINUTES } from './appointments.constants.js';

@Injectable()
export class AppointmentsService {
  constructor(
    private prisma: PrismaService,
    private availabilityService: AvailabilityService
  ) {}

  private async withRetry<T>(operation: () => Promise<T>, retries = 3): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await operation();
      } catch (error: any) {
        if (error.code === 'P2034') {
          if (i < retries - 1) continue;
          throw new InternalServerErrorException('Operation failed after retries due to high concurrency.');
        }
        throw error;
      }
    }
    throw new InternalServerErrorException('Operation failed after retries due to high concurrency.');
  }

  // ---- CREATION ----
  async createAppointment(userId: string, dto: CreateAppointmentDto, durationMinutes = DEFAULT_APPOINTMENT_DURATION_MINUTES) {
    const patient = await this.prisma.patient.findUnique({
      where: { user_id: userId }
    });
    if (!patient) throw new ForbiddenException('Patient profile required.');

    const location = await this.prisma.clinicLocation.findUnique({
      where: { id: dto.clinic_location_id }
    });
    if (!location) throw new NotFoundException('Clinic location not found.');

    const availableSlots = await this.availabilityService.getAvailability(dto.doctor_clinic_id, dto.clinic_location_id, dto.date, durationMinutes);
    const requestedSlot = availableSlots.find(s => s.start === dto.start_time);
    
    if (!requestedSlot) {
      throw new ConflictException('The requested time slot is not available or blocked.');
    }

    const startAt = this.availabilityService.resolveAbsoluteTime(dto.date, requestedSlot.start, location.timezone);
    const endAt = this.availabilityService.resolveAbsoluteTime(dto.date, requestedSlot.end, location.timezone);

    return this.withRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const overlapping = await tx.appointment.findMany({
          where: {
            doctor_clinic_id: dto.doctor_clinic_id,
            clinic_location_id: dto.clinic_location_id,
            status: { not: AppointmentStatus.CANCELLED },
            start_at: { lt: endAt },
            end_at: { gt: startAt }
          }
        });

        if (overlapping.length > 0) {
          throw new ConflictException('Double booking detected. Slot just got taken.');
        }

        return tx.appointment.create({
          data: {
            patient_id: patient.id,
            doctor_clinic_id: dto.doctor_clinic_id,
            clinic_location_id: dto.clinic_location_id,
            appointment_date: dto.date,
            start_at: startAt,
            end_at: endAt,
            status: AppointmentStatus.BOOKED
          }
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    );
  }

  // ---- RETRIEVAL ----
  async getAvailability(doctorClinicId: string, query: any, durationMinutes = DEFAULT_APPOINTMENT_DURATION_MINUTES) {
    return {
      date: query.date,
      duration_minutes: durationMinutes,
      slots: await this.availabilityService.getAvailability(doctorClinicId, query.clinic_location_id, query.date, durationMinutes)
    };
  }

  async getAppointmentById(userId: string, role: string, id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        doctorClinic: true
      }
    });

    if (!appointment) throw new NotFoundException('Appointment not found.');

    if (role === 'PATIENT') {
      const patient = await this.prisma.patient.findUnique({ where: { user_id: userId } });
      if (!patient || appointment.patient_id !== patient.id) {
        throw new NotFoundException('Appointment not found.'); // Hide via 404 for IDOR
      }
    } else if (role === 'DOCTOR') {
      const doctor = await this.prisma.doctor.findUnique({ where: { user_id: userId } });
      if (!doctor || appointment.doctorClinic.doctor_id !== doctor.id) {
        throw new NotFoundException('Appointment not found.');
      }
    } else {
      throw new ForbiddenException('Unauthorized role.');
    }

    return appointment;
  }

  async getPatientAppointments(userId: string, query: AppointmentListQueryDto) {
    const patient = await this.prisma.patient.findUnique({ where: { user_id: userId } });
    if (!patient) throw new ForbiddenException('Patient profile required.');

    const skip = ((query.page || 1) - 1) * (query.limit || 10);
    
    const where: Prisma.AppointmentWhereInput = {
      patient_id: patient.id,
    };
    if (query.status) where.status = query.status;
    if (query.date_from || query.date_to) {
      where.appointment_date = {};
      if (query.date_from) where.appointment_date.gte = query.date_from;
      if (query.date_to) where.appointment_date.lte = query.date_to;
    }

    return this.prisma.appointment.findMany({
      where,
      orderBy: { start_at: 'desc' },
      skip,
      take: query.limit || 10,
    });
  }

  async getDoctorAppointments(userId: string, query: AppointmentListQueryDto) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
      include: { clinics: true }
    });
    if (!doctor) throw new ForbiddenException('Doctor profile required.');

    // Enforce ownership: filter must only target clinics this doctor owns.
    const ownedClinicIds = doctor.clinics.map(c => c.id);
    
    if (query.doctor_clinic_id && !ownedClinicIds.includes(query.doctor_clinic_id)) {
      throw new NotFoundException('DoctorClinic not found.');
    }

    const skip = ((query.page || 1) - 1) * (query.limit || 10);
    
    const where: Prisma.AppointmentWhereInput = {
      doctor_clinic_id: query.doctor_clinic_id ? query.doctor_clinic_id : { in: ownedClinicIds },
    };
    if (query.status) where.status = query.status;
    if (query.date_from || query.date_to) {
      where.appointment_date = {};
      if (query.date_from) where.appointment_date.gte = query.date_from;
      if (query.date_to) where.appointment_date.lte = query.date_to;
    }

    return this.prisma.appointment.findMany({
      where,
      orderBy: { start_at: 'desc' },
      skip,
      take: query.limit || 10,
    });
  }

  // ---- LIFECYCLE ----
  private async transitionStatus(id: string, newStatus: AppointmentStatus, expectedStatus: AppointmentStatus) {
    return this.withRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const current = await tx.appointment.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Appointment not found.');
        if (current.status !== expectedStatus) {
          throw new ConflictException(`Cannot transition from ${current.status} to ${newStatus}.`);
        }
        return tx.appointment.update({
          where: { id },
          data: { status: newStatus }
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    );
  }

  async cancelAppointment(userId: string, role: string, id: string) {
    // 1. Ownership validation
    await this.getAppointmentById(userId, role, id);
    // 2. Transition
    return this.transitionStatus(id, AppointmentStatus.CANCELLED, AppointmentStatus.BOOKED);
  }

  async completeAppointment(userId: string, id: string) {
    // 1. Ownership (Doctor only)
    await this.getAppointmentById(userId, 'DOCTOR', id);
    // 2. Transition
    return this.transitionStatus(id, AppointmentStatus.COMPLETED, AppointmentStatus.BOOKED);
  }

  async markNoShow(userId: string, id: string) {
    // 1. Ownership (Doctor only)
    await this.getAppointmentById(userId, 'DOCTOR', id);
    // 2. Transition
    return this.transitionStatus(id, AppointmentStatus.NO_SHOW, AppointmentStatus.BOOKED);
  }

  // ---- RESCHEDULE ----
  async rescheduleAppointment(userId: string, id: string, dto: RescheduleAppointmentDto, durationMinutes = DEFAULT_APPOINTMENT_DURATION_MINUTES) {
    // 1. Ownership (Patient only - could allow Doctor but prompt implies standard Patient action)
    const appointment = await this.getAppointmentById(userId, 'PATIENT', id);

    if (appointment.status !== AppointmentStatus.BOOKED) {
      throw new ConflictException('Only BOOKED appointments can be rescheduled.');
    }

    const location = await this.prisma.clinicLocation.findUnique({
      where: { id: appointment.clinic_location_id }
    });
    if (!location) throw new NotFoundException('Clinic location not found.');

    // 2. Validate new slot
    // Pass existing appointment ID to exclude it from conflict logic
    const availableSlots = await this.availabilityService.getAvailability(
      appointment.doctor_clinic_id, 
      appointment.clinic_location_id, 
      dto.date, 
      durationMinutes,
      appointment.id
    );

    const requestedSlot = availableSlots.find(s => s.start === dto.start_time);
    
    if (!requestedSlot) {
      throw new ConflictException('The requested time slot is not available or blocked.');
    }

    const startAt = this.availabilityService.resolveAbsoluteTime(dto.date, requestedSlot.start, location.timezone);
    const endAt = this.availabilityService.resolveAbsoluteTime(dto.date, requestedSlot.end, location.timezone);

    // 3. Update Transactionally
    return this.withRetry(() =>
      this.prisma.$transaction(async (tx) => {
        // Re-check original status hasn't changed concurrently
        const current = await tx.appointment.findUnique({ where: { id: appointment.id } });
        if (!current || current.status !== AppointmentStatus.BOOKED) {
          throw new ConflictException('Appointment is no longer in BOOKED status.');
        }

        // Re-check overlap inside transaction boundary, excluding current appointment
        const overlapping = await tx.appointment.findMany({
          where: {
            doctor_clinic_id: appointment.doctor_clinic_id,
            clinic_location_id: appointment.clinic_location_id,
            status: { not: AppointmentStatus.CANCELLED },
            start_at: { lt: endAt },
            end_at: { gt: startAt },
            id: { not: appointment.id } // Exclude self
          }
        });

        if (overlapping.length > 0) {
          throw new ConflictException('Double booking detected. Slot just got taken.');
        }

        return tx.appointment.update({
          where: { id: appointment.id },
          data: {
            appointment_date: dto.date,
            start_at: startAt,
            end_at: endAt,
          }
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    );
  }
}
