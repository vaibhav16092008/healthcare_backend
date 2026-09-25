import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { OnboardingDto } from './dto/onboarding.dto.js';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async onboardUser(
    authId: string, 
    jwtEmail: string | undefined, 
    jwtPhone: string | undefined, 
    dto: OnboardingDto
  ) {
    // Strict identity validation: if client provided email/phone, it MUST match the trusted JWT claims
    if (dto.email && dto.email !== jwtEmail) {
      throw new UnauthorizedException('Provided email does not match verified authenticated identity');
    }
    if (dto.phone && dto.phone !== jwtPhone) {
      throw new UnauthorizedException('Provided phone does not match verified authenticated identity');
    }

    // Use JWT claims as authoritative if client didn't provide them
    const authoritativeEmail = jwtEmail || dto.email;
    const authoritativePhone = jwtPhone || dto.phone;

    const existingUser = await this.prisma.user.findUnique({
      where: { auth_id: authId },
    });

    if (existingUser) {
      return existingUser; // Idempotent success
    }

    try {
      const newUser = await this.prisma.user.create({
        data: {
          auth_id: authId,
          email: authoritativeEmail,
          phone: authoritativePhone,
          status: 'ACTIVE',
        },
      });

      return newUser;
    } catch (error: any) {
      if (error.code === 'P2002') {
        const raceConditionUser = await this.prisma.user.findUnique({
          where: { auth_id: authId },
        });
        if (raceConditionUser) return raceConditionUser;
      }
      throw new InternalServerErrorException('Failed to complete onboarding');
    }
  }
}
