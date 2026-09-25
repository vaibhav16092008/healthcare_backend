import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

@Injectable()
export class MedicalDataAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createGrant(patientUserId: string, doctorId: string) {
    // Verify patient exists
    const patient = await this.prisma.patient.findUnique({ where: { user_id: patientUserId } });
    if (!patient) throw new NotFoundException('Patient not found');

    // Verify doctor exists and is verified
    const doctor = await this.prisma.doctor.findFirst({
      where: { id: doctorId, verification_status: 'VERIFIED' },
    });

    if (!doctor) {
      throw new NotFoundException('Doctor not found or not verified');
    }

    return this.prisma.$transaction(async (tx: any) => {
      // Check if already exists
      const existing = await tx.medicalDataAccessGrant.findFirst({
        where: { patient_id: patient.id, doctor_id: doctorId, status: 'ACTIVE' }
      });
      if (existing) {
        return existing;
      }

      const grant = await tx.medicalDataAccessGrant.create({
        data: {
          patient_id: patient.id,
          doctor_id: doctorId,
          status: 'ACTIVE'
        }
      });

      await this.audit.logEvent(
        tx,
        patientUserId,
        'PATIENT',
        'MEDICAL_ACCESS_GRANTED',
        'MedicalDataAccessGrant',
        grant.id,
        patient.id,
        { doctor_id: doctorId }
      );

      return grant;
    });
  }

  async revokeGrant(patientUserId: string, grantId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { user_id: patientUserId } });
    if (!patient) throw new NotFoundException('Patient not found');

    return this.prisma.$transaction(async (tx: any) => {
      const grant = await tx.medicalDataAccessGrant.findFirst({
        where: { id: grantId, patient_id: patient.id }
      });

      if (!grant) {
        throw new NotFoundException('Grant not found');
      }

      if (grant.status === 'REVOKED') {
        return grant;
      }

      const updated = await tx.medicalDataAccessGrant.update({
        where: { id: grant.id },
        data: { status: 'REVOKED', revoked_at: new Date() }
      });

      await this.audit.logEvent(
        tx,
        patientUserId,
        'PATIENT',
        'MEDICAL_ACCESS_REVOKED',
        'MedicalDataAccessGrant',
        updated.id,
        patient.id,
        { doctor_id: updated.doctor_id }
      );

      return updated;
    });
  }

  async getPatientGrants(patientUserId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { user_id: patientUserId } });
    if (!patient) throw new NotFoundException('Patient not found');

    return this.prisma.medicalDataAccessGrant.findMany({
      where: { patient_id: patient.id },
      include: {
        doctor: {
          include: {
            user: { select: { id: true, email: true } }
          }
        }
      }
    });
  }

  async getDoctorGrants(doctorUserId: string) {
    const doctor = await this.prisma.doctor.findUnique({ where: { user_id: doctorUserId } });
    if (!doctor) throw new NotFoundException('Doctor not found');

    return this.prisma.medicalDataAccessGrant.findMany({
      where: { doctor_id: doctor.id },
      include: {
        patient: {
          include: {
            user: { select: { id: true, email: true } }
          }
        }
      }
    });
  }

  async verifyDoctorAccess(doctorId: string, patientId: string): Promise<boolean> {
    const grant = await this.prisma.medicalDataAccessGrant.findFirst({
      where: {
        doctor_id: doctorId,
        patient_id: patientId,
        status: 'ACTIVE',
        doctor: { verification_status: 'VERIFIED' }
      }
    });
    return !!grant;
  }
}
