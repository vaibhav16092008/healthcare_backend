import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AppRole } from '../auth/roles/roles.enum.js';
import { CreateClinicalDiagnosisDto } from './dto/create-clinical-diagnosis.dto.js';
import { UpdateClinicalDiagnosisDto } from './dto/update-clinical-diagnosis.dto.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class ClinicalDiagnosesService {
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

  async createDiagnosis(userId: string, encounterId: string, dto: CreateClinicalDiagnosisDto) {
    if (!dto.diagnosis_name || dto.diagnosis_name.trim().length === 0) {
      throw new BadRequestException('Diagnosis name cannot be blank.');
    }

    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });

    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can author clinical diagnoses.');
    }

    return await this.withRetry(async () => {
      return this.prisma.$transaction(async (tx) => {
        const encounter = await tx.clinicalEncounter.findUnique({
          where: { id: encounterId },
        });

        if (!encounter) {
          throw new NotFoundException('Clinical encounter not found.');
        }

        if (encounter.doctor_id !== doctor.id) {
          throw new ForbiddenException('Doctor is not associated with this encounter.');
        }

        if (encounter.status !== 'OPEN') {
          throw new ConflictException(`Cannot create diagnosis for an encounter with status ${encounter.status}.`);
        }

        const diagnosis = await tx.clinicalDiagnosis.create({
          data: {
            encounter_id: encounter.id,
            patient_id: encounter.patient_id,
            doctor_id: doctor.id,
            diagnosis_type: dto.diagnosis_type,
            diagnosis_name: dto.diagnosis_name.trim(),
            diagnosis_code: dto.diagnosis_code || null,
            diagnosis_code_system: dto.diagnosis_code_system || null,
            clinical_description: dto.clinical_description || null,
            status: 'ACTIVE',
          },
        });

        await this.audit.logEvent(
          tx,
          userId,
          AppRole.DOCTOR,
          'CLINICAL_DIAGNOSIS_CREATED',
          'ClinicalDiagnosis',
          diagnosis.id,
          encounter.patient_id,
        );

        return diagnosis;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  async updateDiagnosis(userId: string, encounterId: string, diagnosisId: string, dto: UpdateClinicalDiagnosisDto) {
    if (dto.diagnosis_name !== undefined && dto.diagnosis_name.trim().length === 0) {
      throw new BadRequestException('Diagnosis name cannot be blank.');
    }

    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });

    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can modify clinical diagnoses.');
    }

    return await this.withRetry(async () => {
      return this.prisma.$transaction(async (tx) => {
        const encounter = await tx.clinicalEncounter.findUnique({
          where: { id: encounterId },
        });

        if (!encounter || encounter.doctor_id !== doctor.id) {
          throw new NotFoundException('Encounter not found or access denied.');
        }

        if (encounter.status !== 'OPEN') {
          throw new ConflictException(`Cannot update diagnoses for an encounter with status ${encounter.status}.`);
        }

        const existingDiagnosis = await tx.clinicalDiagnosis.findUnique({
          where: { id: diagnosisId },
        });

        if (!existingDiagnosis || existingDiagnosis.encounter_id !== encounterId) {
          throw new NotFoundException('Clinical diagnosis not found for this encounter.');
        }

        const updatedData = { ...dto };
        if (updatedData.diagnosis_name) {
          updatedData.diagnosis_name = updatedData.diagnosis_name.trim();
        }

        const diagnosis = await tx.clinicalDiagnosis.update({
          where: { id: diagnosisId },
          data: updatedData,
        });

        await this.audit.logEvent(
          tx,
          userId,
          AppRole.DOCTOR,
          'CLINICAL_DIAGNOSIS_UPDATED',
          'ClinicalDiagnosis',
          diagnosis.id,
          encounter.patient_id,
        );

        return diagnosis;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  async resolveDiagnosis(userId: string, encounterId: string, diagnosisId: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });

    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can resolve clinical diagnoses.');
    }

    return await this.withRetry(async () => {
      return this.prisma.$transaction(async (tx) => {
        const encounter = await tx.clinicalEncounter.findUnique({
          where: { id: encounterId },
        });

        if (!encounter || encounter.doctor_id !== doctor.id) {
          throw new NotFoundException('Encounter not found or access denied.');
        }

        if (encounter.status !== 'OPEN') {
          throw new ConflictException(`Cannot resolve diagnoses for an encounter with status ${encounter.status}.`);
        }

        const existingDiagnosis = await tx.clinicalDiagnosis.findUnique({
          where: { id: diagnosisId },
        });

        if (!existingDiagnosis || existingDiagnosis.encounter_id !== encounterId) {
          throw new NotFoundException('Clinical diagnosis not found for this encounter.');
        }

        if (existingDiagnosis.status === 'RESOLVED') {
          return existingDiagnosis;
        }

        const diagnosis = await tx.clinicalDiagnosis.update({
          where: { id: diagnosisId },
          data: { status: 'RESOLVED' },
        });

        await this.audit.logEvent(
          tx,
          userId,
          AppRole.DOCTOR,
          'CLINICAL_DIAGNOSIS_RESOLVED',
          'ClinicalDiagnosis',
          diagnosis.id,
          encounter.patient_id,
        );

        return diagnosis;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  async getDiagnoses(userId: string, role: string, encounterId: string) {
    const encounter = await this.prisma.clinicalEncounter.findUnique({
      where: { id: encounterId },
      include: { patient: true },
    });

    if (!encounter) {
      throw new NotFoundException('Clinical encounter not found.');
    }

    if (role === AppRole.PATIENT) {
      if (encounter.patient.user_id !== userId) {
        throw new NotFoundException('Clinical encounter not found.');
      }
    } else if (role === AppRole.DOCTOR) {
      const doctor = await this.prisma.doctor.findUnique({ where: { user_id: userId } });
      if (!doctor || encounter.doctor_id !== doctor.id) {
        throw new NotFoundException('Clinical encounter not found.');
      }
    } else {
      throw new NotFoundException('Clinical encounter not found.');
    }

    const diagnoses = await this.prisma.clinicalDiagnosis.findMany({
      where: { encounter_id: encounterId },
      orderBy: { createdAt: 'asc' },
    });

    await this.audit.logEvent(
      this.prisma,
      userId,
      role,
      'CLINICAL_DIAGNOSIS_VIEWED',
      'ClinicalEncounter_DiagnosesList',
      encounterId,
      encounter.patient_id,
    );

    return diagnoses;
  }

  async getDiagnosisById(userId: string, role: string, encounterId: string, diagnosisId: string) {
    const encounter = await this.prisma.clinicalEncounter.findUnique({
      where: { id: encounterId },
      include: { patient: true },
    });

    if (!encounter) {
      throw new NotFoundException('Clinical diagnosis not found.');
    }

    if (role === AppRole.PATIENT) {
      if (encounter.patient.user_id !== userId) {
        throw new NotFoundException('Clinical diagnosis not found.');
      }
    } else if (role === AppRole.DOCTOR) {
      const doctor = await this.prisma.doctor.findUnique({ where: { user_id: userId } });
      if (!doctor || encounter.doctor_id !== doctor.id) {
        throw new NotFoundException('Clinical diagnosis not found.');
      }
    } else {
      throw new NotFoundException('Clinical diagnosis not found.');
    }

    const diagnosis = await this.prisma.clinicalDiagnosis.findFirst({
      where: {
        id: diagnosisId,
        encounter_id: encounterId,
      },
    });

    if (!diagnosis) {
      throw new NotFoundException('Clinical diagnosis not found.');
    }

    await this.audit.logEvent(
      this.prisma,
      userId,
      role,
      'CLINICAL_DIAGNOSIS_VIEWED',
      'ClinicalDiagnosis',
      diagnosis.id,
      encounter.patient_id,
    );

    return diagnosis;
  }
}
