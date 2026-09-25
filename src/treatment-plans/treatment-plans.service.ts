import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AppRole } from '../auth/roles/roles.enum.js';
import { CreateTreatmentPlanDto } from './dto/create-treatment-plan.dto.js';
import { UpdateTreatmentPlanDto } from './dto/update-treatment-plan.dto.js';
import { CreateTreatmentInstructionDto } from './dto/create-treatment-instruction.dto.js';
import { UpdateTreatmentInstructionDto } from './dto/update-treatment-instruction.dto.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class TreatmentPlansService {
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

  private hasMeaningfulContent(dto: CreateTreatmentPlanDto): boolean {
    const title = dto.title?.trim() || '';
    const summary = dto.summary?.trim() || '';
    return title.length > 0 || summary.length > 0;
  }

  async createPlan(userId: string, encounterId: string, dto: CreateTreatmentPlanDto) {
    if (!this.hasMeaningfulContent(dto)) {
      throw new BadRequestException('Treatment plan must have a title or summary with meaningful text.');
    }

    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });

    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can author treatment plans.');
    }

    return await this.withRetry(async () => {
      return this.prisma.$transaction(async (tx) => {
        const encounter = await tx.clinicalEncounter.findUnique({
          where: { id: encounterId },
          include: { treatmentPlan: true },
        });

        if (!encounter || encounter.doctor_id !== doctor.id) {
          throw new NotFoundException('Clinical encounter not found or access denied.');
        }

        if (encounter.status !== 'OPEN') {
          throw new ConflictException(`Cannot create a treatment plan for an encounter with status ${encounter.status}.`);
        }

        if (encounter.treatmentPlan) {
          throw new ConflictException('A treatment plan already exists for this encounter.');
        }

        const plan = await tx.treatmentPlan.create({
          data: {
            encounter_id: encounter.id,
            patient_id: encounter.patient_id,
            doctor_id: doctor.id,
            title: dto.title?.trim() || '',
            summary: dto.summary?.trim() || null,
            status: 'ACTIVE',
          },
        });

        await this.audit.logEvent(
          tx,
          userId,
          AppRole.DOCTOR,
          'TREATMENT_PLAN_CREATED',
          'TreatmentPlan',
          plan.id,
          encounter.patient_id,
        );

        return plan;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  async updatePlan(userId: string, encounterId: string, dto: UpdateTreatmentPlanDto) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });

    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can modify treatment plans.');
    }

    return await this.withRetry(async () => {
      return this.prisma.$transaction(async (tx) => {
        const encounter = await tx.clinicalEncounter.findUnique({
          where: { id: encounterId },
          include: { treatmentPlan: true },
        });

        if (!encounter || encounter.doctor_id !== doctor.id) {
          throw new NotFoundException('Encounter not found or access denied.');
        }

        if (encounter.status !== 'OPEN') {
          throw new ConflictException(`Cannot modify treatment plans for a closed encounter.`);
        }

        const plan = encounter.treatmentPlan;
        if (!plan) {
          throw new NotFoundException('Treatment plan not found for this encounter.');
        }

        if (plan.status !== 'ACTIVE') {
          throw new ConflictException(`Cannot modify a treatment plan with status ${plan.status}.`);
        }

        const updatedData: any = {};
        if (dto.title !== undefined) updatedData.title = dto.title.trim();
        if (dto.summary !== undefined) updatedData.summary = dto.summary?.trim() || null;

        const updatedPlan = await tx.treatmentPlan.update({
          where: { id: plan.id },
          data: updatedData,
        });

        await this.audit.logEvent(
          tx,
          userId,
          AppRole.DOCTOR,
          'TREATMENT_PLAN_UPDATED',
          'TreatmentPlan',
          plan.id,
          encounter.patient_id,
        );

        return updatedPlan;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  async setPlanStatus(userId: string, encounterId: string, newStatus: 'COMPLETED' | 'CANCELLED') {
    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });

    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can change treatment plan status.');
    }

    return await this.withRetry(async () => {
      return this.prisma.$transaction(async (tx) => {
        const encounter = await tx.clinicalEncounter.findUnique({
          where: { id: encounterId },
          include: { treatmentPlan: true },
        });

        if (!encounter || encounter.doctor_id !== doctor.id) {
          throw new NotFoundException('Encounter not found or access denied.');
        }

        if (encounter.status !== 'OPEN') {
          throw new ConflictException('Cannot change treatment plan status for a closed encounter.');
        }

        const plan = encounter.treatmentPlan;
        if (!plan) {
          throw new NotFoundException('Treatment plan not found.');
        }

        if (plan.status !== 'ACTIVE') {
          throw new ConflictException(`Cannot transition plan from ${plan.status} to ${newStatus}.`);
        }

        const updatedPlan = await tx.treatmentPlan.update({
          where: { id: plan.id },
          data: { status: newStatus },
        });

        await this.audit.logEvent(
          tx,
          userId,
          AppRole.DOCTOR,
          `TREATMENT_PLAN_${newStatus}`,
          'TreatmentPlan',
          plan.id,
          encounter.patient_id,
        );

        return updatedPlan;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  async getPlan(userId: string, role: string, encounterId: string) {
    const encounter = await this.prisma.clinicalEncounter.findUnique({
      where: { id: encounterId },
      include: { patient: true, treatmentPlan: true },
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

    const plan = encounter.treatmentPlan;
    if (!plan) {
      throw new NotFoundException('Treatment plan not found.');
    }

    await this.audit.logEvent(
      this.prisma,
      userId,
      role,
      'TREATMENT_PLAN_VIEWED',
      'TreatmentPlan',
      plan.id,
      encounter.patient_id,
    );

    return plan;
  }

  async createInstruction(userId: string, encounterId: string, dto: CreateTreatmentInstructionDto) {
    if (!dto.instruction_text || dto.instruction_text.trim().length === 0) {
      throw new BadRequestException('Instruction text cannot be blank.');
    }

    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });

    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can author treatment instructions.');
    }

    return await this.withRetry(async () => {
      return this.prisma.$transaction(async (tx) => {
        const encounter = await tx.clinicalEncounter.findUnique({
          where: { id: encounterId },
          include: { treatmentPlan: true },
        });

        if (!encounter || encounter.doctor_id !== doctor.id) {
          throw new NotFoundException('Encounter not found or access denied.');
        }

        if (encounter.status !== 'OPEN') {
          throw new ConflictException('Cannot add instructions to a closed encounter.');
        }

        const plan = encounter.treatmentPlan;
        if (!plan) {
          throw new NotFoundException('Treatment plan not found.');
        }

        if (plan.status !== 'ACTIVE') {
          throw new ConflictException(`Cannot add instructions to a treatment plan with status ${plan.status}.`);
        }

        const instruction = await tx.treatmentInstruction.create({
          data: {
            treatment_plan_id: plan.id,
            instruction_type: dto.instruction_type,
            instruction_text: dto.instruction_text.trim(),
            priority: dto.priority,
          },
        });

        await this.audit.logEvent(
          tx,
          userId,
          AppRole.DOCTOR,
          'TREATMENT_INSTRUCTION_CREATED',
          'TreatmentInstruction',
          instruction.id,
          encounter.patient_id,
        );

        return instruction;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  async updateInstruction(userId: string, encounterId: string, instructionId: string, dto: UpdateTreatmentInstructionDto) {
    if (dto.instruction_text !== undefined && dto.instruction_text.trim().length === 0) {
      throw new BadRequestException('Instruction text cannot be blank.');
    }

    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });

    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can update treatment instructions.');
    }

    return await this.withRetry(async () => {
      return this.prisma.$transaction(async (tx) => {
        const encounter = await tx.clinicalEncounter.findUnique({
          where: { id: encounterId },
          include: { treatmentPlan: true },
        });

        if (!encounter || encounter.doctor_id !== doctor.id) {
          throw new NotFoundException('Encounter not found or access denied.');
        }

        if (encounter.status !== 'OPEN') {
          throw new ConflictException('Cannot modify instructions for a closed encounter.');
        }

        const plan = encounter.treatmentPlan;
        if (!plan) {
          throw new NotFoundException('Treatment plan not found.');
        }

        if (plan.status !== 'ACTIVE') {
          throw new ConflictException(`Cannot modify instructions for a plan with status ${plan.status}.`);
        }

        const existingInstruction = await tx.treatmentInstruction.findUnique({
          where: { id: instructionId },
        });

        if (!existingInstruction || existingInstruction.treatment_plan_id !== plan.id) {
          throw new NotFoundException('Instruction not found for this treatment plan.');
        }

        const updatedData: any = {};
        if (dto.instruction_type) updatedData.instruction_type = dto.instruction_type;
        if (dto.instruction_text !== undefined) updatedData.instruction_text = dto.instruction_text.trim();
        if (dto.priority) updatedData.priority = dto.priority;

        const instruction = await tx.treatmentInstruction.update({
          where: { id: instructionId },
          data: updatedData,
        });

        await this.audit.logEvent(
          tx,
          userId,
          AppRole.DOCTOR,
          'TREATMENT_INSTRUCTION_UPDATED',
          'TreatmentInstruction',
          instruction.id,
          encounter.patient_id,
        );

        return instruction;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  async getInstructions(userId: string, role: string, encounterId: string) {
    const encounter = await this.prisma.clinicalEncounter.findUnique({
      where: { id: encounterId },
      include: { patient: true, treatmentPlan: true },
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

    const plan = encounter.treatmentPlan;
    if (!plan) {
      throw new NotFoundException('Treatment plan not found.');
    }

    const instructions = await this.prisma.treatmentInstruction.findMany({
      where: { treatment_plan_id: plan.id },
      orderBy: { createdAt: 'asc' },
    });

    await this.audit.logEvent(
      this.prisma,
      userId,
      role,
      'TREATMENT_INSTRUCTION_VIEWED',
      'TreatmentPlan_InstructionsList',
      plan.id,
      encounter.patient_id,
    );

    return instructions;
  }

  async getInstructionById(userId: string, role: string, encounterId: string, instructionId: string) {
    const encounter = await this.prisma.clinicalEncounter.findUnique({
      where: { id: encounterId },
      include: { patient: true, treatmentPlan: true },
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

    const plan = encounter.treatmentPlan;
    if (!plan) {
      throw new NotFoundException('Treatment plan not found.');
    }

    const instruction = await this.prisma.treatmentInstruction.findFirst({
      where: {
        id: instructionId,
        treatment_plan_id: plan.id,
      },
    });

    if (!instruction) {
      throw new NotFoundException('Instruction not found.');
    }

    await this.audit.logEvent(
      this.prisma,
      userId,
      role,
      'TREATMENT_INSTRUCTION_VIEWED',
      'TreatmentInstruction',
      instruction.id,
      encounter.patient_id,
    );

    return instruction;
  }
}
