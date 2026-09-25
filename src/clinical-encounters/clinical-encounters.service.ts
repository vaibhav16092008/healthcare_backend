import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AppRole } from '../auth/roles/roles.enum.js';
import { Prisma } from '@prisma/client';


@Injectable()
export class ClinicalEncountersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async withRetry<T>(operation: () => Promise<T>, retries = 3): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && retries > 0) {
        return this.withRetry(operation, retries - 1);
      }
      throw error;
    }
  }

  private async getDoctorOrThrow(userId: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });
    if (!doctor) throw new NotFoundException('Doctor profile not found');
    if (doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Doctor is not verified');
    }
    return doctor;
  }

  private async getPatientOrThrow(userId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { user_id: userId },
    });
    if (!patient) throw new NotFoundException('Patient profile not found');
    return patient;
  }

  async createEncounter(doctorUserId: string, appointmentId: string) {
    const doctor = await this.getDoctorOrThrow(doctorUserId);

    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        doctorClinic: {
          include: {
            clinic: true,
          }
        },
      },
    });

    if (!appointment) throw new NotFoundException('Appointment not found');

    if (appointment.doctorClinic.doctor_id !== doctor.id) {
      throw new NotFoundException('Appointment not found'); // safe masking
    }

    if (appointment.doctorClinic.status !== 'ACTIVE') {
      throw new ForbiddenException('Doctor-clinic relationship is not active');
    }

    if (appointment.doctorClinic.clinic.status !== 'ACTIVE') {
      throw new ForbiddenException('Clinic is not active');
    }

    if (appointment.status !== 'BOOKED') {
      throw new ConflictException('Appointment must be BOOKED to create an encounter');
    }

    try {
      return await this.withRetry(async () => {
        return this.prisma.$transaction(async (tx) => {
          const existingEncounter = await tx.clinicalEncounter.findUnique({
            where: { appointment_id: appointment.id },
          });

          if (existingEncounter) {
            throw new ConflictException('Encounter already exists for this appointment');
          }

          const encounter = await tx.clinicalEncounter.create({
            data: {
              appointment_id: appointment.id,
              patient_id: appointment.patient_id,
              doctor_id: doctor.id,
              doctor_clinic_id: appointment.doctor_clinic_id,
              clinic_location_id: appointment.clinic_location_id,
              status: 'OPEN',
            },
          });

          await this.audit.logEvent(
            tx,
            doctorUserId,
            'DOCTOR',
            'CLINICAL_ENCOUNTER_CREATED',
            'ClinicalEncounter',
            encounter.id,
            encounter.patient_id
          );

          return encounter;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Encounter already exists for this appointment');
      }
      throw error;
    }
  }

  async startEncounter(doctorUserId: string, encounterId: string) {
    const doctor = await this.getDoctorOrThrow(doctorUserId);

    return await this.prisma.$transaction(async (tx) => {
      const encounter = await tx.clinicalEncounter.findFirst({
        where: { id: encounterId, doctor_id: doctor.id },
      });

      if (!encounter) throw new NotFoundException('Encounter not found');
      if (encounter.status !== 'OPEN') throw new ConflictException(`Cannot start a ${encounter.status} encounter`);

      if (encounter.started_at) {
        return encounter;
      }

      const updated = await tx.clinicalEncounter.update({
        where: { id: encounter.id },
        data: { started_at: new Date() },
      });

      await this.audit.logEvent(
        tx,
        doctorUserId,
        'DOCTOR',
        'CLINICAL_ENCOUNTER_STARTED',
        'ClinicalEncounter',
        updated.id,
        updated.patient_id
      );

      return updated;
    });
  }

  async completeEncounter(doctorUserId: string, encounterId: string) {
    const doctor = await this.getDoctorOrThrow(doctorUserId);

    return await this.prisma.$transaction(async (tx) => {
      const encounter = await tx.clinicalEncounter.findFirst({
        where: { id: encounterId, doctor_id: doctor.id },
      });

      if (!encounter) throw new NotFoundException('Encounter not found');
      if (encounter.status !== 'OPEN') throw new ConflictException(`Cannot complete a ${encounter.status} encounter`);
      if (!encounter.started_at) throw new ConflictException('Cannot complete an encounter that has not been started');

      const updated = await tx.clinicalEncounter.update({
        where: { id: encounter.id },
        data: { 
          status: 'COMPLETED',
          ended_at: new Date(),
        },
      });

      await this.audit.logEvent(
        tx,
        doctorUserId,
        'DOCTOR',
        'CLINICAL_ENCOUNTER_COMPLETED',
        'ClinicalEncounter',
        updated.id,
        updated.patient_id
      );

      return updated;
    });
  }

  async cancelEncounter(doctorUserId: string, encounterId: string) {
    const doctor = await this.getDoctorOrThrow(doctorUserId);

    return await this.prisma.$transaction(async (tx) => {
      const encounter = await tx.clinicalEncounter.findFirst({
        where: { id: encounterId, doctor_id: doctor.id },
      });

      if (!encounter) throw new NotFoundException('Encounter not found');
      if (encounter.status !== 'OPEN') throw new ConflictException(`Cannot cancel a ${encounter.status} encounter`);

      const updated = await tx.clinicalEncounter.update({
        where: { id: encounter.id },
        data: { 
          status: 'CANCELLED',
          ended_at: new Date(),
        },
      });

      await this.audit.logEvent(
        tx,
        doctorUserId,
        'DOCTOR',
        'CLINICAL_ENCOUNTER_CANCELLED',
        'ClinicalEncounter',
        updated.id,
        updated.patient_id
      );

      return updated;
    });
  }

  async getEncounter(appUserId: string, role: string, encounterId: string) {
    let encounter;
    if (role === AppRole.PATIENT) {
      const patient = await this.getPatientOrThrow(appUserId);
      encounter = await this.prisma.clinicalEncounter.findFirst({
        where: { id: encounterId, patient_id: patient.id },
      });
    } else if (role === AppRole.DOCTOR) {
      const doctor = await this.getDoctorOrThrow(appUserId);
      encounter = await this.prisma.clinicalEncounter.findFirst({
        where: { id: encounterId, doctor_id: doctor.id },
      });
    }

    if (!encounter) throw new NotFoundException('Encounter not found');

    await this.audit.logEvent(
      this.prisma,
      appUserId,
      role,
      'CLINICAL_ENCOUNTER_VIEWED',
      'ClinicalEncounter',
      encounter.id,
      encounter.patient_id
    );

    return encounter;
  }

  async getEncounterByAppointment(appUserId: string, role: string, appointmentId: string) {
    let encounter;
    if (role === AppRole.PATIENT) {
      const patient = await this.getPatientOrThrow(appUserId);
      encounter = await this.prisma.clinicalEncounter.findFirst({
        where: { appointment_id: appointmentId, patient_id: patient.id },
      });
    } else if (role === AppRole.DOCTOR) {
      const doctor = await this.getDoctorOrThrow(appUserId);
      encounter = await this.prisma.clinicalEncounter.findFirst({
        where: { appointment_id: appointmentId, doctor_id: doctor.id },
      });
    }

    if (!encounter) throw new NotFoundException('Encounter not found');

    await this.audit.logEvent(
      this.prisma,
      appUserId,
      role,
      'CLINICAL_ENCOUNTER_VIEWED',
      'ClinicalEncounter',
      encounter.id,
      encounter.patient_id
    );

    return encounter;
  }
}
