import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateClinicDto, UpdateClinicDto } from './dto/clinic.dto.js';
import { CreateClinicLocationDto, UpdateClinicLocationDto } from './dto/clinic-location.dto.js';
import { CreateDoctorClinicDto } from './dto/doctor-clinic.dto.js';

@Injectable()
export class ClinicsService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // CLINIC MANAGEMENT (Ownership by User/Doctor)
  // ==========================================
  async createClinic(userId: string, dto: CreateClinicDto) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });

    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can create clinics.');
    }

    return this.prisma.clinic.create({
      data: {
        owner_id: userId,
        name: dto.name,
        description: dto.description,
        phone: dto.phone,
        email: dto.email,
        website: dto.website,
      },
    });
  }

  async getClinic(clinicId: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
    });
    if (!clinic) throw new NotFoundException('Clinic not found');
    return clinic;
  }

  async updateClinic(userId: string, clinicId: string, dto: UpdateClinicDto) {
    const clinic = await this.getClinic(clinicId);

    if (clinic.owner_id !== userId) {
      throw new ForbiddenException('You do not have permission to manage this clinic.');
    }

    return this.prisma.clinic.update({
      where: { id: clinicId },
      data: dto,
    });
  }

  // ==========================================
  // CLINIC LOCATIONS
  // ==========================================
  async createLocation(userId: string, clinicId: string, dto: CreateClinicLocationDto) {
    const clinic = await this.getClinic(clinicId);

    if (clinic.owner_id !== userId) {
      throw new ForbiddenException('You do not have permission to add locations to this clinic.');
    }

    // Default IANA timezone and Country as fallback, handled by Prisma defaults for missing/undefined,
    // but we can explicitly map undefined to avoid issues.
    return this.prisma.clinicLocation.create({
      data: {
        clinic_id: clinicId,
        ...dto,
      },
    });
  }

  async getLocations(clinicId: string) {
    await this.getClinic(clinicId); // Validate existence
    return this.prisma.clinicLocation.findMany({
      where: { clinic_id: clinicId },
    });
  }

  async updateLocation(userId: string, clinicId: string, locationId: string, dto: UpdateClinicLocationDto) {
    const clinic = await this.getClinic(clinicId);

    if (clinic.owner_id !== userId) {
      throw new ForbiddenException('You do not have permission to modify locations for this clinic.');
    }

    const location = await this.prisma.clinicLocation.findUnique({
      where: { id: locationId },
    });

    if (!location || location.clinic_id !== clinicId) {
      throw new NotFoundException('Clinic location not found');
    }

    return this.prisma.clinicLocation.update({
      where: { id: locationId },
      data: dto,
    });
  }

  // ==========================================
  // DOCTOR-CLINIC PRACTICE RELATIONSHIPS
  // ==========================================
  async getMyPractices(userId: string) {
    const doctor = await this.prisma.doctor.findUnique({ where: { user_id: userId } });
    if (!doctor) throw new ForbiddenException('Doctor profile required.');

    return this.prisma.doctorClinic.findMany({
      where: { doctor_id: doctor.id },
      include: { clinic: true },
    });
  }

  async addMyPractice(userId: string, dto: CreateDoctorClinicDto) {
    const doctor = await this.prisma.doctor.findUnique({ where: { user_id: userId } });
    if (!doctor || doctor.verification_status !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED doctors can create practice relationships.');
    }

    // Verify clinic exists
    const clinic = await this.prisma.clinic.findUnique({ where: { id: dto.clinic_id } });
    if (!clinic) throw new NotFoundException('Clinic not found');

    if (clinic.status !== 'ACTIVE') {
      throw new ForbiddenException('Cannot join an INACTIVE clinic.');
    }

    try {
      return await this.prisma.doctorClinic.create({
        data: {
          doctor_id: doctor.id,
          clinic_id: dto.clinic_id,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('Doctor is already practicing at this clinic.');
      }
      throw error;
    }
  }

  async removeMyPractice(userId: string, clinicId: string) {
    const doctor = await this.prisma.doctor.findUnique({ where: { user_id: userId } });
    if (!doctor) throw new ForbiddenException('Doctor profile required.');

    const rel = await this.prisma.doctorClinic.findUnique({
      where: { doctor_id_clinic_id: { doctor_id: doctor.id, clinic_id: clinicId } },
    });

    if (!rel) throw new NotFoundException('Practice relationship not found.');

    // We do soft deactivation for historical integrity
    return this.prisma.doctorClinic.update({
      where: { id: rel.id },
      data: {
        status: 'INACTIVE',
        left_at: new Date(),
      },
    });
  }
}
