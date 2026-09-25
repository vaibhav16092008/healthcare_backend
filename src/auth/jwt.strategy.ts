import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppRole } from './roles/roles.enum.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    // JWT Verification Configuration
    // Structured to allow easy migration to JWKS if Supabase configuration changes.
    const jwtSecret = configService.get<string>('SUPABASE_JWT_SECRET');
    if (!jwtSecret && process.env.NODE_ENV === 'production') {
      throw new Error('FATAL SECURITY CONFIGURATION: SUPABASE_JWT_SECRET must be configured in production environments.');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false, // Strict expiration check
      secretOrKey: jwtSecret || 'fallback_for_testing',
      issuer: configService.get<string>('SUPABASE_JWT_ISSUER'), // Must match exactly if provided
      audience: configService.get<string>('SUPABASE_JWT_AUDIENCE'), // e.g. "authenticated"
      algorithms: ['HS256'], // Do not accept tokens signed with unexpected algorithms
    });
  }

  async validate(payload: any) {
    // 1. Validate required identity subject
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Invalid JWT payload. Missing subject.');
    }

    // 2. Resolve internal application identity and attached profiles to resolve roles
    const appUser = await this.prisma.user.findUnique({
      where: { auth_id: payload.sub },
      include: {
        patient: { select: { id: true } },
        doctor: { select: { id: true } },
        admin: { select: { id: true } },
      }
    });

    // 3. Strict account status check
    if (appUser && appUser.status === 'SUSPENDED') {
      throw new UnauthorizedException('User account is suspended');
    }

    // 4. Resolve Roles natively from the database relationships (Zero-trust on client DTOs)
    const roles: AppRole[] = [];
    if (appUser) {
      if (appUser.patient) roles.push(AppRole.PATIENT);
      if (appUser.doctor) roles.push(AppRole.DOCTOR);
      if (appUser.admin) roles.push(AppRole.ADMIN);
    }

    // 5. Return secure identity object (do not attach full raw payload to request)
    return {
      authId: payload.sub,
      email: payload.email, // Derived from trusted JWT claim
      phone: payload.phone, // Derived from trusted JWT claim
      roles,
      appUser: appUser || null,
    };
  }
}
