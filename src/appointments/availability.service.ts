import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { DateTime } from 'luxon';
import { OverrideType } from '../schedules/dto/create-schedule-override.dto.js';
import { DayOfWeek } from '../schedules/dto/create-schedule.dto.js';

export interface Slot {
  start: string;
  end: string;
}

@Injectable()
export class AvailabilityService {
  constructor(private prisma: PrismaService) {}

  private getDayOfWeekEnum(luxonDateTime: DateTime): DayOfWeek {
    const map: Record<number, DayOfWeek> = {
      1: DayOfWeek.MONDAY,
      2: DayOfWeek.TUESDAY,
      3: DayOfWeek.WEDNESDAY,
      4: DayOfWeek.THURSDAY,
      5: DayOfWeek.FRIDAY,
      6: DayOfWeek.SATURDAY,
      7: DayOfWeek.SUNDAY,
    };
    return map[luxonDateTime.weekday];
  }

  private timeToMinutes(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }

  private minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60).toString().padStart(2, '0');
    const m = (minutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  private isOverlapping(startA: number, endA: number, startB: number, endB: number) {
    return (startA < endB && endA > startB);
  }

  async getAvailability(doctorClinicId: string, clinicLocationId: string, date: string, durationMinutes = 30, excludeAppointmentId?: string) {
    // 1. Verify relationships
    const location = await this.prisma.clinicLocation.findUnique({
      where: { id: clinicLocationId },
    });
    if (!location) throw new NotFoundException('Clinic location not found.');

    const docClinic = await this.prisma.doctorClinic.findUnique({
      where: { id: doctorClinicId },
      include: { doctor: true },
    });
    
    if (!docClinic || docClinic.status !== 'ACTIVE') throw new BadRequestException('Inactive practice relationship.');
    if (docClinic.clinic_id !== location.clinic_id) throw new BadRequestException('Location does not belong to the practice clinic.');
    if (docClinic.doctor.verification_status !== 'VERIFIED') throw new BadRequestException('Doctor is not verified.');

    // 2. Parse date & timezone
    const localDateTime = DateTime.fromISO(date, { zone: location.timezone }).startOf('day');
    if (!localDateTime.isValid) throw new BadRequestException('Invalid date format.');

    const now = DateTime.now().setZone(location.timezone);
    if (localDateTime.startOf('day') < now.startOf('day')) {
      return []; // Cannot query past dates
    }

    const dayOfWeek = this.getDayOfWeekEnum(localDateTime);

    // 3. Fetch configurations
    const [schedules, overrides, appointments] = await Promise.all([
      this.prisma.schedule.findMany({
        where: { doctor_clinic_id: doctorClinicId, clinic_location_id: clinicLocationId, day_of_week: dayOfWeek, status: 'ACTIVE' },
        include: { breaks: true }
      }),
      this.prisma.scheduleOverride.findMany({
        where: { doctor_clinic_id: doctorClinicId, clinic_location_id: clinicLocationId, date, status: 'ACTIVE' }
      }),
      this.prisma.appointment.findMany({
        where: { 
          doctor_clinic_id: doctorClinicId, 
          clinic_location_id: clinicLocationId, 
          appointment_date: date, 
          status: { not: 'CANCELLED' },
          ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {})
        }
      })
    ]);

    // Apply Overrides
    const unavailableOverride = overrides.find(o => o.type === OverrideType.UNAVAILABLE);
    if (unavailableOverride) {
      return [];
    }

    let availableBlocks: { start: number, end: number }[] = [];
    let breaksToApply: { start: number, end: number }[] = [];

    const customOverrides = overrides.filter(o => o.type === OverrideType.CUSTOM_AVAILABILITY);
    
    if (customOverrides.length > 0) {
      customOverrides.forEach(o => {
        availableBlocks.push({ start: this.timeToMinutes(o.start_time!), end: this.timeToMinutes(o.end_time!) });
      });
    } else {
      schedules.forEach(s => {
        availableBlocks.push({ start: this.timeToMinutes(s.start_time), end: this.timeToMinutes(s.end_time) });
        s.breaks.forEach(b => {
          breaksToApply.push({ start: this.timeToMinutes(b.start_time), end: this.timeToMinutes(b.end_time) });
        });
      });
    }

    // 4. Generate Slots
    let potentialSlots: { start: number, end: number }[] = [];
    
    for (const block of availableBlocks) {
      let currentStart = block.start;
      while (currentStart + durationMinutes <= block.end) {
        potentialSlots.push({ start: currentStart, end: currentStart + durationMinutes });
        currentStart += durationMinutes;
      }
    }

    // 5. Filter Breaks
    potentialSlots = potentialSlots.filter(slot => {
      return !breaksToApply.some(b => this.isOverlapping(slot.start, slot.end, b.start, b.end));
    });

    // 6. Filter existing appointments
    const appointmentBlocks = appointments.map(app => {
      // Convert UTC absolute time back to local time string then to minutes for comparison
      const startLocal = DateTime.fromJSDate(app.start_at).setZone(location.timezone);
      const endLocal = DateTime.fromJSDate(app.end_at).setZone(location.timezone);
      
      const startMins = startLocal.hour * 60 + startLocal.minute;
      const endMins = endLocal.hour * 60 + endLocal.minute;
      return { start: startMins, end: endMins };
    });

    potentialSlots = potentialSlots.filter(slot => {
      return !appointmentBlocks.some(a => this.isOverlapping(slot.start, slot.end, a.start, a.end));
    });

    // 7. Filter past slots if today
    if (localDateTime.hasSame(now, 'day')) {
      const currentMins = now.hour * 60 + now.minute;
      potentialSlots = potentialSlots.filter(slot => slot.start > currentMins);
    }

    // 8. Map to strings
    return potentialSlots.map(s => ({
      start: this.minutesToTime(s.start),
      end: this.minutesToTime(s.end)
    }));
  }

  // Resolves local date and time string to UTC JS Date
  resolveAbsoluteTime(date: string, time: string, timezone: string): Date {
    const luxonDate = DateTime.fromFormat(`${date} ${time}`, 'yyyy-MM-dd HH:mm', { zone: timezone });
    if (!luxonDate.isValid) throw new BadRequestException('Invalid date/time computation.');
    return luxonDate.toJSDate();
  }
}
