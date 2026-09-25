import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AppRole } from '../auth/roles/roles.enum.js';
import { CreateLabResultDto } from './dto/create-lab-result.dto.js';
import { UpdateLabResultDto } from './dto/update-lab-result.dto.js';
import { CreateLabResultItemDto } from './dto/create-lab-result-item.dto.js';
import { UpdateLabResultItemDto } from './dto/update-lab-result-item.dto.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class LabResultsService {
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

  async createLabResult(userId: string, labOrderId: string, dto: CreateLabResultDto) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });

    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can create lab results.');
    }

    return await this.withRetry(async () => {
      return this.prisma.$transaction(async (tx) => {
        const labOrder = await tx.labOrder.findUnique({
          where: { id: labOrderId },
          include: { encounter: true },
        });

        if (!labOrder || labOrder.doctor_id !== doctor.id) {
          throw new NotFoundException('Lab order not found or access denied.');
        }

        if (labOrder.status === 'CANCELLED') {
          throw new ConflictException('Cannot create a result for a cancelled lab order.');
        }

        if (labOrder.encounter.status !== 'OPEN') {
          throw new ConflictException('Cannot create a lab result for a closed encounter.');
        }

        const existingResult = await tx.labResult.findFirst({
          where: {
            lab_order_id: labOrder.id,
            status: { in: ['PENDING', 'FINAL', 'AMENDED'] }
          }
        });

        if (existingResult) {
          throw new ConflictException('An active lab result already exists for this order. Use amendment if needed.');
        }

        const labResult = await tx.labResult.create({
          data: {
            lab_order_id: labOrder.id,
            patient_id: labOrder.patient_id,
            doctor_id: doctor.id,
            status: 'PENDING',
            report_notes: dto.report_notes?.trim() || null,
          },
        });

        await this.audit.logEvent(
          tx,
          userId,
          AppRole.DOCTOR,
          'LAB_RESULT_CREATED',
          'LabResult',
          labResult.id,
          labResult.patient_id,
        );

        return labResult;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  async getLabResultsForOrder(userId: string, role: string, labOrderId: string) {
    const labOrder = await this.prisma.labOrder.findUnique({
      where: { id: labOrderId },
      include: { encounter: { include: { patient: true } } },
    });

    if (!labOrder) {
      throw new NotFoundException('Lab order not found.');
    }

    const encounter = labOrder.encounter;

    if (role === AppRole.PATIENT) {
      if (encounter.patient.user_id !== userId) {
        throw new NotFoundException('Lab order not found.');
      }
    } else if (role === AppRole.DOCTOR) {
      const doctor = await this.prisma.doctor.findUnique({ where: { user_id: userId } });
      if (!doctor || doctor.verification_status !== 'VERIFIED' || encounter.doctor_id !== doctor.id) {
        throw new NotFoundException('Lab order not found.');
      }
    } else {
      throw new NotFoundException('Lab order not found.');
    }

    const labResults = await this.prisma.labResult.findMany({
      where: { lab_order_id: labOrder.id },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });

    return labResults;
  }

  async getLabResultById(userId: string, role: string, labResultId: string) {
    const labResult = await this.prisma.labResult.findUnique({
      where: { id: labResultId },
      include: {
        labOrder: { include: { encounter: { include: { patient: true } } } },
        items: true,
      },
    });

    if (!labResult) {
      throw new NotFoundException('Lab result not found.');
    }

    const encounter = labResult.labOrder.encounter;

    if (role === AppRole.PATIENT) {
      if (encounter.patient.user_id !== userId) {
        throw new NotFoundException('Lab result not found.');
      }
    } else if (role === AppRole.DOCTOR) {
      const doctor = await this.prisma.doctor.findUnique({ where: { user_id: userId } });
      if (!doctor || doctor.verification_status !== 'VERIFIED' || encounter.doctor_id !== doctor.id) {
        throw new NotFoundException('Lab result not found.');
      }
    } else {
      throw new NotFoundException('Lab result not found.');
    }

    await this.audit.logEvent(
      this.prisma,
      userId,
      role,
      'LAB_RESULT_VIEWED',
      'LabResult',
      labResult.id,
      labResult.patient_id,
    );

    return labResult;
  }

  async finalizeLabResult(userId: string, labResultId: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });

    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can finalize lab results.');
    }

    return await this.withRetry(async () => {
      return this.prisma.$transaction(async (tx) => {
        const labResult = await tx.labResult.findUnique({
          where: { id: labResultId },
          include: { labOrder: { include: { encounter: true } } },
        });

        if (!labResult || labResult.doctor_id !== doctor.id) {
          throw new NotFoundException('Lab result not found or access denied.');
        }

        if (labResult.labOrder.encounter.status !== 'OPEN') {
          throw new ConflictException('Cannot modify lab results for a closed encounter.');
        }

        if (labResult.status !== 'PENDING' && labResult.status !== 'AMENDED') {
          throw new ConflictException(`Cannot finalize a lab result with status ${labResult.status}.`);
        }

        const updatedResult = await tx.labResult.update({
          where: { id: labResult.id },
          data: {
            status: 'FINAL',
            finalized_at: new Date(),
            resulted_at: labResult.resulted_at || new Date(),
          },
        });

        await this.audit.logEvent(
          tx,
          userId,
          AppRole.DOCTOR,
          'LAB_RESULT_FINALIZED',
          'LabResult',
          labResult.id,
          labResult.patient_id,
        );

        return updatedResult;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  async amendLabResult(userId: string, labResultId: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });

    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can amend lab results.');
    }

    return await this.withRetry(async () => {
      return this.prisma.$transaction(async (tx) => {
        const labResult = await tx.labResult.findUnique({
          where: { id: labResultId },
          include: { labOrder: { include: { encounter: true } } },
        });

        if (!labResult || labResult.doctor_id !== doctor.id) {
          throw new NotFoundException('Lab result not found or access denied.');
        }

        if (labResult.labOrder.encounter.status !== 'OPEN') {
          throw new ConflictException('Cannot modify lab results for a closed encounter.');
        }

        if (labResult.status !== 'FINAL') {
          throw new ConflictException(`Cannot amend a lab result with status ${labResult.status}.`);
        }

        const updatedResult = await tx.labResult.update({
          where: { id: labResult.id },
          data: {
            status: 'AMENDED',
          },
        });

        await this.audit.logEvent(
          tx,
          userId,
          AppRole.DOCTOR,
          'LAB_RESULT_AMENDED',
          'LabResult',
          labResult.id,
          labResult.patient_id,
        );

        return updatedResult;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  async cancelLabResult(userId: string, labResultId: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });

    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can cancel lab results.');
    }

    return await this.withRetry(async () => {
      return this.prisma.$transaction(async (tx) => {
        const labResult = await tx.labResult.findUnique({
          where: { id: labResultId },
          include: { labOrder: { include: { encounter: true } } },
        });

        if (!labResult || labResult.doctor_id !== doctor.id) {
          throw new NotFoundException('Lab result not found or access denied.');
        }

        if (labResult.labOrder.encounter.status !== 'OPEN') {
          throw new ConflictException('Cannot modify lab results for a closed encounter.');
        }

        if (labResult.status !== 'PENDING' && labResult.status !== 'AMENDED') {
          throw new ConflictException(`Cannot cancel a lab result with status ${labResult.status}.`);
        }

        const updatedResult = await tx.labResult.update({
          where: { id: labResult.id },
          data: {
            status: 'CANCELLED',
          },
        });

        await this.audit.logEvent(
          tx,
          userId,
          AppRole.DOCTOR,
          'LAB_RESULT_CANCELLED',
          'LabResult',
          labResult.id,
          labResult.patient_id,
        );

        return updatedResult;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  async createLabResultItem(userId: string, labResultId: string, dto: CreateLabResultItemDto) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });

    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can create lab result items.');
    }

    return await this.withRetry(async () => {
      return this.prisma.$transaction(async (tx) => {
        const labResult = await tx.labResult.findUnique({
          where: { id: labResultId },
          include: { labOrder: { include: { encounter: true } } },
        });

        if (!labResult || labResult.doctor_id !== doctor.id) {
          throw new NotFoundException('Lab result not found or access denied.');
        }

        if (labResult.labOrder.encounter.status !== 'OPEN') {
          throw new ConflictException('Cannot modify lab results for a closed encounter.');
        }

        if (labResult.status !== 'PENDING' && labResult.status !== 'AMENDED') {
          throw new ConflictException(`Cannot add items to a lab result with status ${labResult.status}.`);
        }

        const labOrderItem = await tx.labOrderItem.findUnique({
          where: { id: dto.lab_order_item_id },
        });

        if (!labOrderItem) {
          throw new BadRequestException('Lab order item not found.');
        }

        if (labOrderItem.lab_order_id !== labResult.lab_order_id) {
          throw new BadRequestException('Lab order item belongs to a different lab order.');
        }

        const item = await tx.labResultItem.create({
          data: {
            lab_result_id: labResult.id,
            lab_order_item_id: labOrderItem.id,
            result_value: dto.result_value?.trim() || null,
            unit: dto.unit?.trim() || null,
            reference_range: dto.reference_range?.trim() || null,
            qualitative_result: dto.qualitative_result?.trim() || null,
            notes: dto.notes?.trim() || null,
          },
        });

        await this.audit.logEvent(
          tx,
          userId,
          AppRole.DOCTOR,
          'LAB_RESULT_ITEM_CREATED',
          'LabResultItem',
          item.id,
          labResult.patient_id,
        );

        return item;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  async updateLabResultItem(userId: string, labResultId: string, itemId: string, dto: UpdateLabResultItemDto) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });

    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can update lab result items.');
    }

    return await this.withRetry(async () => {
      return this.prisma.$transaction(async (tx) => {
        const labResult = await tx.labResult.findUnique({
          where: { id: labResultId },
          include: { labOrder: { include: { encounter: true } } },
        });

        if (!labResult || labResult.doctor_id !== doctor.id) {
          throw new NotFoundException('Lab result not found or access denied.');
        }

        if (labResult.labOrder.encounter.status !== 'OPEN') {
          throw new ConflictException('Cannot modify lab results for a closed encounter.');
        }

        if (labResult.status !== 'PENDING' && labResult.status !== 'AMENDED') {
          throw new ConflictException(`Cannot edit items in a lab result with status ${labResult.status}.`);
        }

        const existingItem = await tx.labResultItem.findUnique({
          where: { id: itemId },
        });

        if (!existingItem || existingItem.lab_result_id !== labResult.id) {
          throw new NotFoundException('Lab result item not found.');
        }

        const updatedData: any = {};
        if (dto.result_value !== undefined) updatedData.result_value = dto.result_value?.trim() || null;
        if (dto.unit !== undefined) updatedData.unit = dto.unit?.trim() || null;
        if (dto.reference_range !== undefined) updatedData.reference_range = dto.reference_range?.trim() || null;
        if (dto.qualitative_result !== undefined) updatedData.qualitative_result = dto.qualitative_result?.trim() || null;
        if (dto.notes !== undefined) updatedData.notes = dto.notes?.trim() || null;

        const item = await tx.labResultItem.update({
          where: { id: itemId },
          data: updatedData,
        });

        await this.audit.logEvent(
          tx,
          userId,
          AppRole.DOCTOR,
          'LAB_RESULT_ITEM_UPDATED',
          'LabResultItem',
          item.id,
          labResult.patient_id,
        );

        return item;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  async getLabResultItems(userId: string, role: string, labResultId: string) {
    const labResult = await this.prisma.labResult.findUnique({
      where: { id: labResultId },
      include: { labOrder: { include: { encounter: { include: { patient: true } } } } },
    });

    if (!labResult) {
      throw new NotFoundException('Lab result not found.');
    }

    const encounter = labResult.labOrder.encounter;

    if (role === AppRole.PATIENT) {
      if (encounter.patient.user_id !== userId) {
        throw new NotFoundException('Lab result not found.');
      }
    } else if (role === AppRole.DOCTOR) {
      const doctor = await this.prisma.doctor.findUnique({ where: { user_id: userId } });
      if (!doctor || doctor.verification_status !== 'VERIFIED' || encounter.doctor_id !== doctor.id) {
        throw new NotFoundException('Lab result not found.');
      }
    } else {
      throw new NotFoundException('Lab result not found.');
    }

    const items = await this.prisma.labResultItem.findMany({
      where: { lab_result_id: labResult.id },
      orderBy: { createdAt: 'asc' },
    });

    return items;
  }

  async getLabResultItemById(userId: string, role: string, labResultId: string, itemId: string) {
    const labResult = await this.prisma.labResult.findUnique({
      where: { id: labResultId },
      include: { labOrder: { include: { encounter: { include: { patient: true } } } } },
    });

    if (!labResult) {
      throw new NotFoundException('Lab result not found.');
    }

    const encounter = labResult.labOrder.encounter;

    if (role === AppRole.PATIENT) {
      if (encounter.patient.user_id !== userId) {
        throw new NotFoundException('Lab result not found.');
      }
    } else if (role === AppRole.DOCTOR) {
      const doctor = await this.prisma.doctor.findUnique({ where: { user_id: userId } });
      if (!doctor || doctor.verification_status !== 'VERIFIED' || encounter.doctor_id !== doctor.id) {
        throw new NotFoundException('Lab result not found.');
      }
    } else {
      throw new NotFoundException('Lab result not found.');
    }

    const item = await this.prisma.labResultItem.findFirst({
      where: { id: itemId, lab_result_id: labResult.id },
    });

    if (!item) {
      throw new NotFoundException('Lab result item not found.');
    }

    await this.audit.logEvent(
      this.prisma,
      userId,
      role,
      'LAB_RESULT_ITEM_VIEWED',
      'LabResultItem',
      item.id,
      encounter.patient_id,
    );

    return item;
  }
}
