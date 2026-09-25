import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateDoctorVerificationDto } from './dto/update-doctor-verification.dto.js';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getPendingDoctors() {
    return this.prisma.doctor.findMany({
      where: { verification_status: 'PENDING' },
      select: {
        id: true,
        specialization: true,
        experience_years: true,
        registration_number: true,
        medical_council_name: true,
        registration_year: true,
        verification_status: true,
        createdAt: true,
        user: { select: { email: true, phone: true } }
      }
    });
  }

  async getDoctorById(doctorId: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      select: {
        id: true,
        specialization: true,
        experience_years: true,
        registration_number: true,
        medical_council_name: true,
        registration_year: true,
        verification_status: true,
        createdAt: true,
        user: { select: { email: true, phone: true } }
      }
    });
    if (!doctor) throw new NotFoundException('Doctor not found');
    return doctor;
  }

  async updateDoctorVerification(doctorId: string, dto: UpdateDoctorVerificationDto) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId }
    });

    if (!doctor) throw new NotFoundException('Doctor not found');

    if (doctor.verification_status !== 'PENDING') {
      throw new ConflictException(`Cannot change verification status from ${doctor.verification_status}. Status is immutable once determined.`);
    }

    return this.prisma.doctor.update({
      where: { id: doctorId },
      data: {
        verification_status: dto.status
      },
      select: {
        id: true,
        verification_status: true,
        updatedAt: true
      }
    });
  }
}
