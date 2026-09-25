import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AppRole } from '../auth/roles/roles.enum.js';
import { CreateLabOrderDto } from './dto/create-lab-order.dto.js';
import { UpdateLabOrderDto } from './dto/update-lab-order.dto.js';
import { CreateLabOrderItemDto } from './dto/create-lab-order-item.dto.js';
import { UpdateLabOrderItemDto } from './dto/update-lab-order-item.dto.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class LabOrdersService {
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

  async createLabOrder(userId: string, encounterId: string, dto: CreateLabOrderDto) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });

    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can create lab orders.');
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
          throw new ConflictException(`Cannot create a lab order for an encounter with status ${encounter.status}.`);
        }

        const labOrder = await tx.labOrder.create({
          data: {
            encounter_id: encounter.id,
            patient_id: encounter.patient_id,
            doctor_id: doctor.id,
            status: 'ORDERED',
            clinical_notes: dto.clinical_notes?.trim() || null,
          },
        });

        await this.audit.logEvent(
          tx,
          userId,
          AppRole.DOCTOR,
          'LAB_ORDER_CREATED',
          'LabOrder',
          labOrder.id,
          encounter.patient_id,
        );

        return labOrder;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  async getLabOrdersForEncounter(userId: string, role: string, encounterId: string) {
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

    const labOrders = await this.prisma.labOrder.findMany({
      where: { encounter_id: encounter.id },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });

    return labOrders;
  }

  async getLabOrderById(userId: string, role: string, labOrderId: string) {
    const labOrder = await this.prisma.labOrder.findUnique({
      where: { id: labOrderId },
      include: {
        encounter: { include: { patient: true } },
        items: { include: { labTest: true } },
      },
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
      if (!doctor || encounter.doctor_id !== doctor.id) {
        throw new NotFoundException('Lab order not found.');
      }
    } else {
      throw new NotFoundException('Lab order not found.');
    }

    await this.audit.logEvent(
      this.prisma,
      userId,
      role,
      'LAB_ORDER_VIEWED',
      'LabOrder',
      labOrder.id,
      encounter.patient_id,
    );

    return labOrder;
  }

  async updateLabOrder(userId: string, labOrderId: string, dto: UpdateLabOrderDto) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });

    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can modify lab orders.');
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

        if (labOrder.encounter.status !== 'OPEN') {
          throw new ConflictException(`Cannot modify lab orders for a closed encounter.`);
        }

        if (labOrder.status !== 'ORDERED') {
          throw new ConflictException(`Cannot modify a lab order with status ${labOrder.status}.`);
        }

        const updatedData: any = {};
        if (dto.clinical_notes !== undefined) updatedData.clinical_notes = dto.clinical_notes?.trim() || null;

        const updatedLabOrder = await tx.labOrder.update({
          where: { id: labOrder.id },
          data: updatedData,
        });

        await this.audit.logEvent(
          tx,
          userId,
          AppRole.DOCTOR,
          'LAB_ORDER_UPDATED',
          'LabOrder',
          labOrder.id,
          labOrder.patient_id,
        );

        return updatedLabOrder;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  async setLabOrderStatus(userId: string, labOrderId: string, newStatus: 'COMPLETED' | 'CANCELLED') {
    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });

    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can change lab order status.');
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

        if (labOrder.encounter.status !== 'OPEN') {
          throw new ConflictException(`Cannot modify lab orders for a closed encounter.`);
        }

        if (labOrder.status !== 'ORDERED') {
          throw new ConflictException(`Cannot transition lab order from ${labOrder.status} to ${newStatus}.`);
        }

        const updatedLabOrder = await tx.labOrder.update({
          where: { id: labOrder.id },
          data: { status: newStatus },
        });

        await this.audit.logEvent(
          tx,
          userId,
          AppRole.DOCTOR,
          `LAB_ORDER_${newStatus}`,
          'LabOrder',
          labOrder.id,
          labOrder.patient_id,
        );

        return updatedLabOrder;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  async createLabOrderItem(userId: string, labOrderId: string, dto: CreateLabOrderItemDto) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });

    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can add lab order items.');
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

        if (labOrder.encounter.status !== 'OPEN') {
          throw new ConflictException(`Cannot modify lab orders for a closed encounter.`);
        }

        if (labOrder.status !== 'ORDERED') {
          throw new ConflictException(`Cannot add items to a lab order with status ${labOrder.status}.`);
        }

        const labTest = await tx.labTest.findUnique({
          where: { id: dto.lab_test_id },
        });

        if (!labTest) {
          throw new BadRequestException('Invalid lab test reference.');
        }

        if (!labTest.is_active) {
          throw new BadRequestException('Cannot order an inactive lab test.');
        }

        const item = await tx.labOrderItem.create({
          data: {
            lab_order_id: labOrder.id,
            lab_test_id: labTest.id,
            instructions: dto.instructions?.trim() || null,
          },
        });

        await this.audit.logEvent(
          tx,
          userId,
          AppRole.DOCTOR,
          'LAB_ORDER_ITEM_CREATED',
          'LabOrderItem',
          item.id,
          labOrder.patient_id,
        );

        return item;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  async updateLabOrderItem(userId: string, labOrderId: string, itemId: string, dto: UpdateLabOrderItemDto) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });

    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can update lab order items.');
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

        if (labOrder.encounter.status !== 'OPEN') {
          throw new ConflictException(`Cannot modify lab orders for a closed encounter.`);
        }

        if (labOrder.status !== 'ORDERED') {
          throw new ConflictException(`Cannot modify items in a lab order with status ${labOrder.status}.`);
        }

        const existingItem = await tx.labOrderItem.findUnique({
          where: { id: itemId },
        });

        if (!existingItem || existingItem.lab_order_id !== labOrder.id) {
          throw new NotFoundException('Lab order item not found.');
        }

        const updatedData: any = {};
        if (dto.instructions !== undefined) updatedData.instructions = dto.instructions?.trim() || null;

        const item = await tx.labOrderItem.update({
          where: { id: itemId },
          data: updatedData,
        });

        await this.audit.logEvent(
          tx,
          userId,
          AppRole.DOCTOR,
          'LAB_ORDER_ITEM_UPDATED',
          'LabOrderItem',
          item.id,
          labOrder.patient_id,
        );

        return item;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  async getLabOrderItems(userId: string, role: string, labOrderId: string) {
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
      if (!doctor || encounter.doctor_id !== doctor.id) {
        throw new NotFoundException('Lab order not found.');
      }
    } else {
      throw new NotFoundException('Lab order not found.');
    }

    const items = await this.prisma.labOrderItem.findMany({
      where: { lab_order_id: labOrder.id },
      include: { labTest: true },
      orderBy: { createdAt: 'asc' },
    });

    return items;
  }

  async getLabOrderItemById(userId: string, role: string, labOrderId: string, itemId: string) {
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
      if (!doctor || encounter.doctor_id !== doctor.id) {
        throw new NotFoundException('Lab order not found.');
      }
    } else {
      throw new NotFoundException('Lab order not found.');
    }

    const item = await this.prisma.labOrderItem.findFirst({
      where: { id: itemId, lab_order_id: labOrder.id },
      include: { labTest: true },
    });

    if (!item) {
      throw new NotFoundException('Lab order item not found.');
    }

    await this.audit.logEvent(
      this.prisma,
      userId,
      role,
      'LAB_ORDER_ITEM_VIEWED',
      'LabOrderItem',
      item.id,
      encounter.patient_id,
    );

    return item;
  }
}
