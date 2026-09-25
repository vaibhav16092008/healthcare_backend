import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AppRole } from '../auth/roles/roles.enum.js';
import { CreatePrescriptionDto } from './dto/create-prescription.dto.js';
import { UpdatePrescriptionDto } from './dto/update-prescription.dto.js';
import { CreatePrescriptionItemDto } from './dto/create-prescription-item.dto.js';
import { UpdatePrescriptionItemDto } from './dto/update-prescription-item.dto.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class PrescriptionsService {
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

  async createPrescription(userId: string, encounterId: string, dto: CreatePrescriptionDto) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });

    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can create prescriptions.');
    }

    return await this.withRetry(async () => {
      return this.prisma.$transaction(async (tx) => {
        const encounter = await tx.clinicalEncounter.findUnique({
          where: { id: encounterId },
        });

        if (!encounter || encounter.doctor_id !== doctor.id) {
          throw new NotFoundException('Clinical encounter not found or access denied.');
        }

        if (encounter.status !== 'OPEN') {
          throw new ConflictException(`Cannot create a prescription for an encounter with status ${encounter.status}.`);
        }

        const prescription = await tx.prescription.create({
          data: {
            encounter_id: encounter.id,
            patient_id: encounter.patient_id,
            doctor_id: doctor.id,
            status: 'ACTIVE',
            notes: dto.notes?.trim() || null,
          },
        });

        await this.audit.logEvent(
          tx,
          userId,
          AppRole.DOCTOR,
          'PRESCRIPTION_CREATED',
          'Prescription',
          prescription.id,
          encounter.patient_id,
        );

        return prescription;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  async getPrescriptionsForEncounter(userId: string, role: string, encounterId: string) {
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

    const prescriptions = await this.prisma.prescription.findMany({
      where: { encounter_id: encounter.id },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });

    return prescriptions;
  }

  async getPrescriptionById(userId: string, role: string, prescriptionId: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: {
        encounter: { include: { patient: true } },
        items: { include: { medication: true } },
      },
    });

    if (!prescription) {
      throw new NotFoundException('Prescription not found.');
    }

    const encounter = prescription.encounter;

    if (role === AppRole.PATIENT) {
      if (encounter.patient.user_id !== userId) {
        throw new NotFoundException('Prescription not found.');
      }
    } else if (role === AppRole.DOCTOR) {
      const doctor = await this.prisma.doctor.findUnique({ where: { user_id: userId } });
      if (!doctor || encounter.doctor_id !== doctor.id) {
        throw new NotFoundException('Prescription not found.');
      }
    } else {
      throw new NotFoundException('Prescription not found.');
    }

    await this.audit.logEvent(
      this.prisma,
      userId,
      role,
      'PRESCRIPTION_VIEWED',
      'Prescription',
      prescription.id,
      encounter.patient_id,
    );

    return prescription;
  }

  async updatePrescription(userId: string, prescriptionId: string, dto: UpdatePrescriptionDto) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });

    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can modify prescriptions.');
    }

    return await this.withRetry(async () => {
      return this.prisma.$transaction(async (tx) => {
        const prescription = await tx.prescription.findUnique({
          where: { id: prescriptionId },
          include: { encounter: true },
        });

        if (!prescription || prescription.doctor_id !== doctor.id) {
          throw new NotFoundException('Prescription not found or access denied.');
        }

        if (prescription.encounter.status !== 'OPEN') {
          throw new ConflictException(`Cannot modify prescriptions for a closed encounter.`);
        }

        if (prescription.status !== 'ACTIVE') {
          throw new ConflictException(`Cannot modify a prescription with status ${prescription.status}.`);
        }

        const updatedData: any = {};
        if (dto.notes !== undefined) updatedData.notes = dto.notes?.trim() || null;

        const updatedPrescription = await tx.prescription.update({
          where: { id: prescription.id },
          data: updatedData,
        });

        await this.audit.logEvent(
          tx,
          userId,
          AppRole.DOCTOR,
          'PRESCRIPTION_UPDATED',
          'Prescription',
          prescription.id,
          prescription.patient_id,
        );

        return updatedPrescription;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  async setPrescriptionStatus(userId: string, prescriptionId: string, newStatus: 'COMPLETED' | 'CANCELLED') {
    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });

    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can change prescription status.');
    }

    return await this.withRetry(async () => {
      return this.prisma.$transaction(async (tx) => {
        const prescription = await tx.prescription.findUnique({
          where: { id: prescriptionId },
          include: { encounter: true },
        });

        if (!prescription || prescription.doctor_id !== doctor.id) {
          throw new NotFoundException('Prescription not found or access denied.');
        }

        if (prescription.encounter.status !== 'OPEN') {
          throw new ConflictException(`Cannot modify prescriptions for a closed encounter.`);
        }

        if (prescription.status !== 'ACTIVE') {
          throw new ConflictException(`Cannot transition prescription from ${prescription.status} to ${newStatus}.`);
        }

        const updatedPrescription = await tx.prescription.update({
          where: { id: prescription.id },
          data: { status: newStatus },
        });

        await this.audit.logEvent(
          tx,
          userId,
          AppRole.DOCTOR,
          `PRESCRIPTION_${newStatus}`,
          'Prescription',
          prescription.id,
          prescription.patient_id,
        );

        return updatedPrescription;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  async createPrescriptionItem(userId: string, prescriptionId: string, dto: CreatePrescriptionItemDto) {
    if (!dto.dosage || dto.dosage.trim().length === 0) throw new BadRequestException('Dosage cannot be blank.');
    if (!dto.frequency || dto.frequency.trim().length === 0) throw new BadRequestException('Frequency cannot be blank.');

    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });

    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can add prescription items.');
    }

    return await this.withRetry(async () => {
      return this.prisma.$transaction(async (tx) => {
        const prescription = await tx.prescription.findUnique({
          where: { id: prescriptionId },
          include: { encounter: true },
        });

        if (!prescription || prescription.doctor_id !== doctor.id) {
          throw new NotFoundException('Prescription not found or access denied.');
        }

        if (prescription.encounter.status !== 'OPEN') {
          throw new ConflictException(`Cannot modify prescriptions for a closed encounter.`);
        }

        if (prescription.status !== 'ACTIVE') {
          throw new ConflictException(`Cannot add items to a prescription with status ${prescription.status}.`);
        }

        const medication = await tx.medication.findUnique({
          where: { id: dto.medication_id },
        });

        if (!medication) {
          throw new BadRequestException('Invalid medication reference.');
        }

        if (!medication.is_active) {
          throw new BadRequestException('Cannot prescribe an inactive medication.');
        }

        const item = await tx.prescriptionItem.create({
          data: {
            prescription_id: prescription.id,
            medication_id: medication.id,
            dosage: dto.dosage.trim(),
            frequency: dto.frequency.trim(),
            route: dto.route?.trim() || null,
            duration: dto.duration?.trim() || null,
            quantity: dto.quantity?.trim() || null,
            instructions: dto.instructions?.trim() || null,
          },
        });

        await this.audit.logEvent(
          tx,
          userId,
          AppRole.DOCTOR,
          'PRESCRIPTION_ITEM_CREATED',
          'PrescriptionItem',
          item.id,
          prescription.patient_id,
        );

        return item;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  async updatePrescriptionItem(userId: string, prescriptionId: string, itemId: string, dto: UpdatePrescriptionItemDto) {
    if (dto.dosage !== undefined && dto.dosage.trim().length === 0) throw new BadRequestException('Dosage cannot be blank.');
    if (dto.frequency !== undefined && dto.frequency.trim().length === 0) throw new BadRequestException('Frequency cannot be blank.');

    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });

    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can update prescription items.');
    }

    return await this.withRetry(async () => {
      return this.prisma.$transaction(async (tx) => {
        const prescription = await tx.prescription.findUnique({
          where: { id: prescriptionId },
          include: { encounter: true },
        });

        if (!prescription || prescription.doctor_id !== doctor.id) {
          throw new NotFoundException('Prescription not found or access denied.');
        }

        if (prescription.encounter.status !== 'OPEN') {
          throw new ConflictException(`Cannot modify prescriptions for a closed encounter.`);
        }

        if (prescription.status !== 'ACTIVE') {
          throw new ConflictException(`Cannot modify items in a prescription with status ${prescription.status}.`);
        }

        const existingItem = await tx.prescriptionItem.findUnique({
          where: { id: itemId },
        });

        if (!existingItem || existingItem.prescription_id !== prescription.id) {
          throw new NotFoundException('Prescription item not found.');
        }

        const updatedData: any = {};
        if (dto.dosage !== undefined) updatedData.dosage = dto.dosage.trim();
        if (dto.frequency !== undefined) updatedData.frequency = dto.frequency.trim();
        if (dto.route !== undefined) updatedData.route = dto.route?.trim() || null;
        if (dto.duration !== undefined) updatedData.duration = dto.duration?.trim() || null;
        if (dto.quantity !== undefined) updatedData.quantity = dto.quantity?.trim() || null;
        if (dto.instructions !== undefined) updatedData.instructions = dto.instructions?.trim() || null;

        const item = await tx.prescriptionItem.update({
          where: { id: itemId },
          data: updatedData,
        });

        await this.audit.logEvent(
          tx,
          userId,
          AppRole.DOCTOR,
          'PRESCRIPTION_ITEM_UPDATED',
          'PrescriptionItem',
          item.id,
          prescription.patient_id,
        );

        return item;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  async getPrescriptionItems(userId: string, role: string, prescriptionId: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: { encounter: { include: { patient: true } } },
    });

    if (!prescription) {
      throw new NotFoundException('Prescription not found.');
    }

    const encounter = prescription.encounter;

    if (role === AppRole.PATIENT) {
      if (encounter.patient.user_id !== userId) {
        throw new NotFoundException('Prescription not found.');
      }
    } else if (role === AppRole.DOCTOR) {
      const doctor = await this.prisma.doctor.findUnique({ where: { user_id: userId } });
      if (!doctor || encounter.doctor_id !== doctor.id) {
        throw new NotFoundException('Prescription not found.');
      }
    } else {
      throw new NotFoundException('Prescription not found.');
    }

    const items = await this.prisma.prescriptionItem.findMany({
      where: { prescription_id: prescription.id },
      include: { medication: true },
      orderBy: { createdAt: 'asc' },
    });

    return items;
  }

  async getPrescriptionItemById(userId: string, role: string, prescriptionId: string, itemId: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: { encounter: { include: { patient: true } } },
    });

    if (!prescription) {
      throw new NotFoundException('Prescription not found.');
    }

    const encounter = prescription.encounter;

    if (role === AppRole.PATIENT) {
      if (encounter.patient.user_id !== userId) {
        throw new NotFoundException('Prescription not found.');
      }
    } else if (role === AppRole.DOCTOR) {
      const doctor = await this.prisma.doctor.findUnique({ where: { user_id: userId } });
      if (!doctor || encounter.doctor_id !== doctor.id) {
        throw new NotFoundException('Prescription not found.');
      }
    } else {
      throw new NotFoundException('Prescription not found.');
    }

    const item = await this.prisma.prescriptionItem.findFirst({
      where: { id: itemId, prescription_id: prescription.id },
      include: { medication: true },
    });

    if (!item) {
      throw new NotFoundException('Prescription item not found.');
    }

    await this.audit.logEvent(
      this.prisma,
      userId,
      role,
      'PRESCRIPTION_ITEM_VIEWED',
      'PrescriptionItem',
      item.id,
      encounter.patient_id,
    );

    return item;
  }
}
