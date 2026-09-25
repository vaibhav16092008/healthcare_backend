import { Injectable, ConflictException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePatientProfileDto } from './dto/create-patient-profile.dto.js';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto.js';

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async createProfile(userId: string, dto: CreatePatientProfileDto) {
    try {
      const patient = await this.prisma.patient.create({
        data: {
          user_id: userId,
          date_of_birth: dto.date_of_birth ? new Date(dto.date_of_birth) : undefined,
          gender: dto.gender,
          blood_group: dto.blood_group,
          address_line1: dto.address_line1,
          city: dto.city,
          state: dto.state,
          pincode: dto.pincode,
          emergency_contact_name: dto.emergency_contact_name,
          emergency_contact_phone: dto.emergency_contact_phone,
        },
      });
      return patient;
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('Patient profile already exists for this user.');
      }
      throw new InternalServerErrorException('Failed to create patient profile');
    }
  }

  async getProfile(userId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { user_id: userId },
    });
    if (!patient) {
      throw new NotFoundException('Patient profile not found.');
    }
    return patient;
  }

  async updateProfile(userId: string, dto: UpdatePatientProfileDto) {
    try {
      const updated = await this.prisma.patient.update({
        where: { user_id: userId },
        data: {
          date_of_birth: dto.date_of_birth ? new Date(dto.date_of_birth) : undefined,
          gender: dto.gender,
          blood_group: dto.blood_group,
          address_line1: dto.address_line1,
          city: dto.city,
          state: dto.state,
          pincode: dto.pincode,
          emergency_contact_name: dto.emergency_contact_name,
          emergency_contact_phone: dto.emergency_contact_phone,
        },
      });
      return updated;
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException('Patient profile not found.');
      }
      throw new InternalServerErrorException('Failed to update patient profile');
    }
  }
}
