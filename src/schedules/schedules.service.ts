import { Injectable, ForbiddenException, NotFoundException, ConflictException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';
import { CreateScheduleDto } from './dto/create-schedule.dto.js';
import { UpdateScheduleDto } from './dto/update-schedule.dto.js';
import { CreateBreakDto } from './dto/create-break.dto.js';
import { UpdateBreakDto } from './dto/update-break.dto.js';
import { CreateScheduleOverrideDto, OverrideType } from './dto/create-schedule-override.dto.js';
import { UpdateScheduleOverrideDto } from './dto/update-schedule-override.dto.js';

@Injectable()
export class SchedulesService {
  constructor(private prisma: PrismaService) {}

  private validateTime(start: string, end: string) {
    if (start >= end) {
      throw new BadRequestException('start_time must be strictly before end_time (overnight schedules not supported)');
    }
  }

  private isOverlapping(newStart: string, newEnd: string, existingStart: string, existingEnd: string): boolean {
    return (newStart < existingEnd && newEnd > existingStart);
  }

  // Retry wrapper for serialization failures (P2034)
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

  // Helper to resolve relationships and verify ownership
  private async getVerifiedDoctorContext(userId: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });
    if (!doctor) throw new ForbiddenException('Doctor profile required.');
    if (doctor.verification_status !== 'VERIFIED') throw new ForbiddenException('Only verified doctors can manage schedules.');
    return doctor;
  }

  private async verifyLocationRelationship(doctorId: string, clinicLocationId: string) {
    const location = await this.prisma.clinicLocation.findUnique({
      where: { id: clinicLocationId },
      include: { clinic: true },
    });
    if (!location) throw new NotFoundException('Clinic location not found.');

    const docClinic = await this.prisma.doctorClinic.findUnique({
      where: { doctor_id_clinic_id: { doctor_id: doctorId, clinic_id: location.clinic_id } },
    });

    if (!docClinic) throw new ForbiddenException('You do not practice at this clinic.');
    if (docClinic.status !== 'ACTIVE') throw new ForbiddenException('Practice relationship is inactive.');

    return { doctorClinicId: docClinic.id, location };
  }

  // ==========================
  // SCHEDULES
  // ==========================
  async createSchedule(userId: string, dto: CreateScheduleDto) {
    this.validateTime(dto.start_time, dto.end_time);
    const doctor = await this.getVerifiedDoctorContext(userId);
    const context = await this.verifyLocationRelationship(doctor.id, dto.clinic_location_id);

    return this.withRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const existing = await tx.schedule.findMany({
          where: {
            doctor_clinic_id: context.doctorClinicId,
            clinic_location_id: dto.clinic_location_id,
            day_of_week: dto.day_of_week as any,
            status: 'ACTIVE',
          },
        });

        for (const e of existing) {
          if (this.isOverlapping(dto.start_time, dto.end_time, e.start_time, e.end_time)) {
            throw new ConflictException('Schedule overlaps with an existing interval.');
          }
        }

        return tx.schedule.create({
          data: {
            doctor_clinic_id: context.doctorClinicId,
            clinic_location_id: dto.clinic_location_id,
            day_of_week: dto.day_of_week as any,
            start_time: dto.start_time,
            end_time: dto.end_time,
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    );
  }

  async getMySchedules(userId: string, clinicLocationId?: string) {
    const doctor = await this.getVerifiedDoctorContext(userId);
    const whereClause: any = {
      doctorClinic: { doctor_id: doctor.id },
      status: 'ACTIVE',
    };
    if (clinicLocationId) whereClause.clinic_location_id = clinicLocationId;

    return this.prisma.schedule.findMany({
      where: whereClause,
      include: { breaks: true },
      orderBy: { day_of_week: 'asc' },
    });
  }

  async getScheduleById(userId: string, scheduleId: string) {
    const doctor = await this.getVerifiedDoctorContext(userId);
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: { breaks: true, doctorClinic: true },
    });
    if (!schedule) throw new NotFoundException('Schedule not found.');
    if (schedule.doctorClinic.doctor_id !== doctor.id) throw new NotFoundException('Schedule not found.');
    return schedule;
  }

  async updateSchedule(userId: string, scheduleId: string, dto: UpdateScheduleDto) {
    const doctor = await this.getVerifiedDoctorContext(userId);

    return this.withRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const schedule = await tx.schedule.findUnique({
          where: { id: scheduleId },
          include: { doctorClinic: true },
        });

        if (!schedule) throw new NotFoundException('Schedule not found.');
        if (schedule.doctorClinic.doctor_id !== doctor.id) throw new NotFoundException('Schedule not found.');
        if (schedule.status !== 'ACTIVE') throw new BadRequestException('Cannot update an inactive schedule.');
        if (schedule.doctorClinic.status !== 'ACTIVE') throw new BadRequestException('Practice relationship is inactive.');

        const newLocId = dto.clinic_location_id ?? schedule.clinic_location_id;
        const newDay = dto.day_of_week ?? schedule.day_of_week;
        const newStart = dto.start_time ?? schedule.start_time;
        const newEnd = dto.end_time ?? schedule.end_time;

        this.validateTime(newStart, newEnd);

        if (newLocId !== schedule.clinic_location_id) {
          const loc = await tx.clinicLocation.findUnique({ where: { id: newLocId } });
          if (!loc) throw new NotFoundException('New clinic location not found.');
          
          const docClinic = await tx.doctorClinic.findUnique({
            where: { doctor_id_clinic_id: { doctor_id: doctor.id, clinic_id: loc.clinic_id } },
          });
          if (!docClinic || docClinic.status !== 'ACTIVE') {
            throw new ForbiddenException('You do not practice at the new clinic location.');
          }
          if (docClinic.id !== schedule.doctor_clinic_id) {
            throw new BadRequestException('Cannot move schedule to a completely different practice context directly. Recreate it instead.');
          }
        }

        const existing = await tx.schedule.findMany({
          where: {
            doctor_clinic_id: schedule.doctor_clinic_id,
            clinic_location_id: newLocId,
            day_of_week: newDay as any,
            status: 'ACTIVE',
            id: { not: scheduleId },
          },
        });

        for (const e of existing) {
          if (this.isOverlapping(newStart, newEnd, e.start_time, e.end_time)) {
            throw new ConflictException('Updated schedule overlaps with an existing interval.');
          }
        }

        const breaks = await tx.scheduleBreak.findMany({ where: { schedule_id: scheduleId } });
        for (const b of breaks) {
          if (b.start_time < newStart || b.end_time > newEnd) {
            throw new ConflictException(`Break ${b.start_time}-${b.end_time} is outside the new schedule bounds.`);
          }
        }

        return tx.schedule.update({
          where: { id: scheduleId },
          data: {
            clinic_location_id: newLocId,
            day_of_week: newDay as any,
            start_time: newStart,
            end_time: newEnd,
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    );
  }

  async deleteSchedule(userId: string, scheduleId: string) {
    const doctor = await this.getVerifiedDoctorContext(userId);
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: { doctorClinic: true },
    });
    
    if (!schedule) throw new NotFoundException('Schedule not found.');
    if (schedule.doctorClinic.doctor_id !== doctor.id) throw new NotFoundException('Schedule not found.');

    return this.prisma.schedule.update({
      where: { id: scheduleId },
      data: { status: 'INACTIVE' },
    });
  }

  // ==========================
  // BREAKS
  // ==========================
  async createBreak(userId: string, scheduleId: string, dto: CreateBreakDto) {
    this.validateTime(dto.start_time, dto.end_time);
    const doctor = await this.getVerifiedDoctorContext(userId);

    return this.withRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const schedule = await tx.schedule.findUnique({
          where: { id: scheduleId },
          include: { doctorClinic: true, breaks: true },
        });

        if (!schedule) throw new NotFoundException('Schedule not found.');
        if (schedule.doctorClinic.doctor_id !== doctor.id) throw new NotFoundException('Schedule not found.');
        if (schedule.status !== 'ACTIVE') throw new BadRequestException('Schedule is inactive.');
        if (schedule.doctorClinic.status !== 'ACTIVE') throw new BadRequestException('Practice relationship is inactive.');

        if (dto.start_time < schedule.start_time || dto.end_time > schedule.end_time) {
          throw new BadRequestException('Break must fall completely within the schedule interval.');
        }

        for (const b of schedule.breaks) {
          if (this.isOverlapping(dto.start_time, dto.end_time, b.start_time, b.end_time)) {
            throw new ConflictException('Break overlaps with another break.');
          }
        }

        return tx.scheduleBreak.create({
          data: {
            schedule_id: scheduleId,
            start_time: dto.start_time,
            end_time: dto.end_time,
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    );
  }

  async getBreakById(userId: string, scheduleId: string, breakId: string) {
    const doctor = await this.getVerifiedDoctorContext(userId);
    const schedBreak = await this.prisma.scheduleBreak.findUnique({
      where: { id: breakId },
      include: { schedule: { include: { doctorClinic: true } } },
    });

    if (!schedBreak || schedBreak.schedule_id !== scheduleId) throw new NotFoundException('Break not found.');
    if (schedBreak.schedule.doctorClinic.doctor_id !== doctor.id) throw new NotFoundException('Break not found.');
    return schedBreak;
  }

  async updateBreak(userId: string, scheduleId: string, breakId: string, dto: UpdateBreakDto) {
    const doctor = await this.getVerifiedDoctorContext(userId);

    return this.withRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const schedBreak = await tx.scheduleBreak.findUnique({
          where: { id: breakId },
          include: { schedule: { include: { doctorClinic: true, breaks: true } } },
        });

        if (!schedBreak || schedBreak.schedule_id !== scheduleId) throw new NotFoundException('Break not found.');
        if (schedBreak.schedule.doctorClinic.doctor_id !== doctor.id) throw new NotFoundException('Break not found.');
        if (schedBreak.schedule.status !== 'ACTIVE') throw new BadRequestException('Schedule is inactive.');
        if (schedBreak.schedule.doctorClinic.status !== 'ACTIVE') throw new BadRequestException('Practice relationship is inactive.');

        const newStart = dto.start_time ?? schedBreak.start_time;
        const newEnd = dto.end_time ?? schedBreak.end_time;
        this.validateTime(newStart, newEnd);

        if (newStart < schedBreak.schedule.start_time || newEnd > schedBreak.schedule.end_time) {
          throw new BadRequestException('Break must fall completely within the schedule interval.');
        }

        for (const b of schedBreak.schedule.breaks) {
          if (b.id === breakId) continue;
          if (this.isOverlapping(newStart, newEnd, b.start_time, b.end_time)) {
            throw new ConflictException('Updated break overlaps with another break.');
          }
        }

        return tx.scheduleBreak.update({
          where: { id: breakId },
          data: {
            start_time: newStart,
            end_time: newEnd,
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    );
  }

  async deleteBreak(userId: string, scheduleId: string, breakId: string) {
    const doctor = await this.getVerifiedDoctorContext(userId);
    const schedBreak = await this.prisma.scheduleBreak.findUnique({
      where: { id: breakId },
      include: { schedule: { include: { doctorClinic: true } } },
    });

    if (!schedBreak || schedBreak.schedule_id !== scheduleId) throw new NotFoundException('Break not found.');
    if (schedBreak.schedule.doctorClinic.doctor_id !== doctor.id) throw new NotFoundException('Break not found.');

    return this.prisma.scheduleBreak.delete({ where: { id: breakId } });
  }

  // ==========================
  // OVERRIDES
  // ==========================
  async createOverride(userId: string, dto: CreateScheduleOverrideDto) {
    if (dto.type === OverrideType.CUSTOM_AVAILABILITY) {
      if (!dto.start_time || !dto.end_time) throw new BadRequestException('start_time and end_time required for CUSTOM_AVAILABILITY');
      this.validateTime(dto.start_time, dto.end_time);
    } else {
      if (dto.start_time || dto.end_time) throw new BadRequestException('UNAVAILABLE override cannot have start_time or end_time');
    }

    const doctor = await this.getVerifiedDoctorContext(userId);
    const context = await this.verifyLocationRelationship(doctor.id, dto.clinic_location_id);

    return this.withRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const existing = await tx.scheduleOverride.findMany({
          where: {
            doctor_clinic_id: context.doctorClinicId,
            clinic_location_id: dto.clinic_location_id,
            date: dto.date,
            status: 'ACTIVE',
          },
        });

        if (dto.type === OverrideType.UNAVAILABLE) {
          if (existing.length > 0) throw new ConflictException('Date already has overrides. Remove them first.');
        } else {
          for (const e of existing) {
            if (e.type === OverrideType.UNAVAILABLE) {
              throw new ConflictException('Cannot add custom availability to an entirely UNAVAILABLE date.');
            }
            if (e.start_time && e.end_time && dto.start_time && dto.end_time) {
              if (this.isOverlapping(dto.start_time, dto.end_time, e.start_time, e.end_time)) {
                throw new ConflictException('Override interval overlaps.');
              }
            }
          }
        }

        return tx.scheduleOverride.create({
          data: {
            doctor_clinic_id: context.doctorClinicId,
            clinic_location_id: dto.clinic_location_id,
            date: dto.date,
            type: dto.type,
            start_time: dto.start_time,
            end_time: dto.end_time,
            reason: dto.reason,
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    );
  }

  async getMyOverrides(userId: string, clinicLocationId?: string) {
    const doctor = await this.getVerifiedDoctorContext(userId);
    const whereClause: any = {
      doctorClinic: { doctor_id: doctor.id },
      status: 'ACTIVE',
    };
    if (clinicLocationId) whereClause.clinic_location_id = clinicLocationId;

    return this.prisma.scheduleOverride.findMany({
      where: whereClause,
      orderBy: { date: 'asc' },
    });
  }

  async getOverrideById(userId: string, overrideId: string) {
    const doctor = await this.getVerifiedDoctorContext(userId);
    const override = await this.prisma.scheduleOverride.findUnique({
      where: { id: overrideId, status: 'ACTIVE' },
      include: { doctorClinic: true },
    });

    if (!override) throw new NotFoundException('Override not found.');
    if (override.doctorClinic.doctor_id !== doctor.id) throw new NotFoundException('Override not found.');
    return override;
  }

  async updateOverride(userId: string, overrideId: string, dto: UpdateScheduleOverrideDto) {
    const doctor = await this.getVerifiedDoctorContext(userId);

    return this.withRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const override = await tx.scheduleOverride.findUnique({
          where: { id: overrideId },
          include: { doctorClinic: true },
        });

        if (!override) throw new NotFoundException('Override not found.');
        if (override.doctorClinic.doctor_id !== doctor.id) throw new NotFoundException('Override not found.');
        if (override.status !== 'ACTIVE') throw new BadRequestException('Cannot update an inactive override.');
        if (override.doctorClinic.status !== 'ACTIVE') throw new BadRequestException('Practice relationship is inactive.');

        const newLocId = dto.clinic_location_id ?? override.clinic_location_id;
        const newDate = dto.date ?? override.date;
        const newType = dto.type ?? override.type;
        const newStart = dto.start_time !== undefined ? dto.start_time : override.start_time;
        const newEnd = dto.end_time !== undefined ? dto.end_time : override.end_time;
        const newReason = dto.reason !== undefined ? dto.reason : override.reason;

        if (newType === OverrideType.CUSTOM_AVAILABILITY) {
          if (!newStart || !newEnd) throw new BadRequestException('start_time and end_time required for CUSTOM_AVAILABILITY');
          this.validateTime(newStart, newEnd);
        } else {
          if (newStart || newEnd) throw new BadRequestException('UNAVAILABLE override cannot have start_time or end_time');
        }

        if (newLocId !== override.clinic_location_id) {
          const loc = await tx.clinicLocation.findUnique({ where: { id: newLocId } });
          if (!loc) throw new NotFoundException('New clinic location not found.');
          const docClinic = await tx.doctorClinic.findUnique({
            where: { doctor_id_clinic_id: { doctor_id: doctor.id, clinic_id: loc.clinic_id } },
          });
          if (!docClinic || docClinic.status !== 'ACTIVE') throw new ForbiddenException('You do not practice at the new clinic location.');
          if (docClinic.id !== override.doctor_clinic_id) throw new BadRequestException('Cannot move override to a different practice context.');
        }

        const existing = await tx.scheduleOverride.findMany({
          where: {
            doctor_clinic_id: override.doctor_clinic_id,
            clinic_location_id: newLocId,
            date: newDate,
            status: 'ACTIVE',
            id: { not: overrideId },
          },
        });

        if (newType === OverrideType.UNAVAILABLE) {
          if (existing.length > 0) throw new ConflictException('Date already has overrides. Remove them first.');
        } else {
          for (const e of existing) {
            if (e.type === OverrideType.UNAVAILABLE) {
              throw new ConflictException('Cannot add custom availability to an entirely UNAVAILABLE date.');
            }
            if (e.start_time && e.end_time && newStart && newEnd) {
              if (this.isOverlapping(newStart, newEnd, e.start_time, e.end_time)) {
                throw new ConflictException('Override interval overlaps.');
              }
            }
          }
        }

        return tx.scheduleOverride.update({
          where: { id: overrideId },
          data: {
            clinic_location_id: newLocId,
            date: newDate,
            type: newType,
            start_time: newType === OverrideType.UNAVAILABLE ? null : newStart,
            end_time: newType === OverrideType.UNAVAILABLE ? null : newEnd,
            reason: newReason,
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    );
  }

  async deleteOverride(userId: string, overrideId: string) {
    const doctor = await this.getVerifiedDoctorContext(userId);
    const override = await this.prisma.scheduleOverride.findUnique({
      where: { id: overrideId },
      include: { doctorClinic: true },
    });

    if (!override) throw new NotFoundException('Override not found.');
    if (override.doctorClinic.doctor_id !== doctor.id) throw new NotFoundException('Override not found.');

    return this.prisma.scheduleOverride.update({
      where: { id: overrideId },
      data: { status: 'INACTIVE' },
    });
  }
}
