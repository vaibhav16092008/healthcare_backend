import { Injectable, ConflictException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateDoctorProfileDto } from './dto/create-doctor-profile.dto.js';
import { UpdateDoctorProfileDto } from './dto/update-doctor-profile.dto.js';
import { DoctorSearchQueryDto } from './dto/doctor-search-query.dto.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  async createProfile(userId: string, dto: CreateDoctorProfileDto) {
    try {
      const doctor = await this.prisma.doctor.create({
        data: {
          user_id: userId,
          specialization: dto.specialization,
          experience_years: dto.experience_years,
          registration_number: dto.registration_number,
          medical_council_name: dto.medical_council_name,
          registration_year: dto.registration_year,
          bio: dto.bio,
          consultation_fee: dto.consultation_fee,
          // verification_status defaults to PENDING
          // is_accepting_live_requests defaults to false
        },
      });
      return doctor;
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('Doctor profile already exists or registration number is duplicated.');
      }
      throw new InternalServerErrorException('Failed to create doctor profile');
    }
  }

  async getProfile(userId: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });
    if (!doctor) {
      throw new NotFoundException('Doctor profile not found.');
    }
    return doctor;
  }

  async updateProfile(userId: string, dto: UpdateDoctorProfileDto) {
    try {
      const updated = await this.prisma.doctor.update({
        where: { user_id: userId },
        data: {
          specialization: dto.specialization,
          experience_years: dto.experience_years,
          registration_number: dto.registration_number,
          medical_council_name: dto.medical_council_name,
          registration_year: dto.registration_year,
          bio: dto.bio,
          consultation_fee: dto.consultation_fee,
        },
      });
      return updated;
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException('Doctor profile not found.');
      }
      if (error.code === 'P2002') {
        throw new ConflictException('Registration number already in use.');
      }
      throw new InternalServerErrorException('Failed to update doctor profile');
    }
  }

  async searchDoctors(query: DoctorSearchQueryDto) {
    const { page = 1, limit = 20, q, specialization, clinic_id, city, state, pincode } = query;
    const skip = (page - 1) * limit;

    const clinicSomeFilter: Prisma.DoctorClinicWhereInput = {
      status: 'ACTIVE',
      clinic: { status: 'ACTIVE' }
    };

    if (clinic_id) {
      clinicSomeFilter.clinic_id = clinic_id;
    }

    if (city || state || pincode) {
      const locationFilters: Prisma.ClinicLocationWhereInput = {};
      if (city) locationFilters.city = { equals: city, mode: 'insensitive' };
      if (state) locationFilters.state = { equals: state, mode: 'insensitive' };
      if (pincode) locationFilters.postal_code = pincode;

      clinicSomeFilter.clinic = {
        ...(clinicSomeFilter.clinic as Prisma.ClinicWhereInput),
        locations: { some: locationFilters }
      };
    }

    const where: Prisma.DoctorWhereInput = {
      verification_status: 'VERIFIED',
      user: { status: 'ACTIVE' },
      clinics: { some: clinicSomeFilter }
    };

    if (specialization) {
      where.specialization = { equals: specialization, mode: 'insensitive' };
    }

    if (q) {
      where.OR = [
        { specialization: { contains: q, mode: 'insensitive' } },
        { medical_council_name: { contains: q, mode: 'insensitive' } },
        { clinics: { some: { clinic: { name: { contains: q, mode: 'insensitive' } } } } }
      ];
    }

    const [total, doctors] = await Promise.all([
      this.prisma.doctor.count({ where }),
      this.prisma.doctor.findMany({
        where,
        orderBy: { id: 'asc' },
        skip,
        take: limit,
        include: {
          clinics: {
            where: { 
              status: 'ACTIVE',
              clinic: { status: 'ACTIVE' }
            },
            include: {
              clinic: {
                include: {
                  locations: true
                }
              }
            }
          }
        }
      })
    ]);

    const data = doctors.map(doc => ({
      id: doc.id,
      specialization: doc.specialization,
      experience_years: doc.experience_years,
      bio: doc.bio,
      consultation_fee: doc.consultation_fee ? Number(doc.consultation_fee) : null,
      verification_status: doc.verification_status,
      clinics: doc.clinics.map(dc => ({
        id: dc.clinic.id,
        name: dc.clinic.name,
        locations: dc.clinic.locations.map(loc => ({
          id: loc.id,
          city: loc.city,
          state: loc.state,
          pincode: loc.postal_code,
          timezone: loc.timezone
        }))
      }))
    }));

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    };
  }
}
