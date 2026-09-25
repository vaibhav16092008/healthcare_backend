import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AppRole } from '../auth/roles/roles.enum.js';
import { CreateClinicalNoteDto } from './dto/create-clinical-note.dto.js';
import { UpdateClinicalNoteDto } from './dto/update-clinical-note.dto.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class ClinicalNotesService {
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

  private validateNoteContent(dto: CreateClinicalNoteDto | UpdateClinicalNoteDto) {
    if (!dto.subjective && !dto.objective && !dto.clinical_observations) {
      throw new BadRequestException('Note must contain at least one clinical documentation field.');
    }
  }

  async createNote(userId: string, encounterId: string, dto: CreateClinicalNoteDto) {
    this.validateNoteContent(dto);

    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });

    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can author clinical notes.');
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
          throw new ConflictException(`Cannot create notes for an encounter with status ${encounter.status}.`);
        }

        const note = await tx.clinicalNote.create({
          data: {
            encounter_id: encounter.id,
            patient_id: encounter.patient_id,
            doctor_id: doctor.id,
            note_type: dto.note_type,
            subjective: dto.subjective || null,
            objective: dto.objective || null,
            clinical_observations: dto.clinical_observations || null,
          },
        });

        await this.audit.logEvent(
          tx,
          userId,
          AppRole.DOCTOR,
          'CLINICAL_NOTE_CREATED',
          'ClinicalNote',
          note.id,
          encounter.patient_id,
        );

        return note;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  async updateNote(userId: string, encounterId: string, noteId: string, dto: UpdateClinicalNoteDto) {
    if (Object.keys(dto).length > 0) {
       // if they passed empty body, we skip validation, but Prisma wouldn't change anything.
       // actually let's ensure they aren't emptying the note completely.
       // Wait, PATCH is partial. If they pass fields, we will merge.
       // It's easier to just fetch it first.
    }

    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });

    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can modify clinical notes.');
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
          throw new ConflictException(`Cannot update notes for an encounter with status ${encounter.status}.`);
        }

        const existingNote = await tx.clinicalNote.findUnique({
          where: { id: noteId },
        });

        if (!existingNote || existingNote.encounter_id !== encounterId) {
          throw new NotFoundException('Clinical note not found for this encounter.');
        }

        const updatedData = { ...dto };
        const simulatedMerge = {
          subjective: updatedData.subjective !== undefined ? updatedData.subjective : existingNote.subjective,
          objective: updatedData.objective !== undefined ? updatedData.objective : existingNote.objective,
          clinical_observations: updatedData.clinical_observations !== undefined ? updatedData.clinical_observations : existingNote.clinical_observations,
        };

        if (!simulatedMerge.subjective && !simulatedMerge.objective && !simulatedMerge.clinical_observations) {
          throw new BadRequestException('Note must contain at least one clinical documentation field.');
        }

        const note = await tx.clinicalNote.update({
          where: { id: noteId },
          data: updatedData,
        });

        await this.audit.logEvent(
          tx,
          userId,
          AppRole.DOCTOR,
          'CLINICAL_NOTE_UPDATED',
          'ClinicalNote',
          note.id,
          encounter.patient_id,
        );

        return note;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  async getNotes(userId: string, role: string, encounterId: string) {
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

    const notes = await this.prisma.clinicalNote.findMany({
      where: { encounter_id: encounterId },
      orderBy: { createdAt: 'asc' },
    });

    await this.audit.logEvent(
      this.prisma,
      userId,
      role,
      'CLINICAL_NOTE_VIEWED',
      'ClinicalEncounter_NotesList',
      encounterId,
      encounter.patient_id,
    );

    return notes;
  }

  async getNoteById(userId: string, role: string, encounterId: string, noteId: string) {
    const encounter = await this.prisma.clinicalEncounter.findUnique({
      where: { id: encounterId },
      include: { patient: true },
    });

    if (!encounter) {
      throw new NotFoundException('Clinical note not found.');
    }

    if (role === AppRole.PATIENT) {
      if (encounter.patient.user_id !== userId) {
        throw new NotFoundException('Clinical note not found.');
      }
    } else if (role === AppRole.DOCTOR) {
      const doctor = await this.prisma.doctor.findUnique({ where: { user_id: userId } });
      if (!doctor || encounter.doctor_id !== doctor.id) {
        throw new NotFoundException('Clinical note not found.');
      }
    } else {
      throw new NotFoundException('Clinical note not found.');
    }

    const note = await this.prisma.clinicalNote.findFirst({
      where: {
        id: noteId,
        encounter_id: encounterId,
      },
    });

    if (!note) {
      throw new NotFoundException('Clinical note not found.');
    }

    await this.audit.logEvent(
      this.prisma,
      userId,
      role,
      'CLINICAL_NOTE_VIEWED',
      'ClinicalNote',
      note.id,
      encounter.patient_id,
    );

    return note;
  }
}
