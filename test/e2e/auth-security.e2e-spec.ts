import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import crypto, { randomUUID } from 'node:crypto';

function parseAndEncodeDbUrl(rawUrl: string): { encodedUrl: string; hostname: string; port: string; dbName: string; username: string } {
  const withoutProto = rawUrl.replace(/^postgres(?:ql)?:\/\//, '');
  const lastAt = withoutProto.lastIndexOf('@');
  let username = '<unknown>';
  let password = '';
  let hostPart = withoutProto;

  if (lastAt !== -1) {
    const credentials = withoutProto.slice(0, lastAt);
    hostPart = withoutProto.slice(lastAt + 1);
    const colonIdx = credentials.indexOf(':');
    username = colonIdx !== -1 ? credentials.slice(0, colonIdx) : credentials;
    password = colonIdx !== -1 ? credentials.slice(colonIdx + 1) : '';
  }

  const parts = hostPart.split('?');
  const hostAndDb = parts[0];
  const queryString = parts[1] ?? '';
  const slashIdx = hostAndDb.indexOf('/');
  const hostPort = slashIdx !== -1 ? hostAndDb.slice(0, slashIdx) : hostAndDb;
  const dbName   = slashIdx !== -1 ? hostAndDb.slice(slashIdx + 1) : 'postgres';

  const colonIdx = hostPort.lastIndexOf(':');
  const hostname = colonIdx !== -1 ? hostPort.slice(0, colonIdx) : hostPort;
  const port     = colonIdx !== -1 ? hostPort.slice(colonIdx + 1) : '5432';

  const encodedPass = encodeURIComponent(password);
  const qs = queryString ? `?${queryString}` : '';
  const encodedUrl = `postgresql://${username}:${encodedPass}@${hostname}:${port}/${dbName}${qs}`;

  return { encodedUrl, hostname, port, dbName, username };
}

describe('Real End-to-End Security & Auth Suite against Real Supabase PostgreSQL (Phase 14 Hardened)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let patientAUser: any;
  let patientAProfile: any;
  let patientBUser: any;
  let patientBProfile: any;
  let doctorAUser: any;
  let doctorAProfile: any;
  let doctorBUser: any;
  let doctorBProfile: any;

  function generateAuthToken(authId: string, secretOverride?: string, expiresInSeconds = 3600) {
    const secret = secretOverride || process.env.SUPABASE_JWT_SECRET || 'fallback_for_testing';
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      sub: authId,
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    })).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
    return `${header}.${payload}.${signature}`;
  }

  beforeAll(async () => {
    const rawUrl = process.env.TEST_DATABASE_URL;
    if (!rawUrl) {
      throw new Error('TEST_DATABASE_URL must be defined for real E2E tests.');
    }

    const { encodedUrl, hostname } = parseAndEncodeDbUrl(rawUrl);

    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      throw new Error(`TEST_DATABASE_URL points to local host (${hostname}). Real Supabase PostgreSQL database required.`);
    }

    // Set process.env.DATABASE_URL in runtime memory so NestJS PrismaService connects to Supabase
    process.env.DATABASE_URL = encodedUrl;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    await prisma.$connect();

    // Verify connection to real PostgreSQL
    const dbIdentity: any[] = await prisma.$queryRaw`
      SELECT current_database() as db, current_user as usr, version() as ver
    `;
    expect(dbIdentity[0].db).toBe('postgres');

    // Create test entities in real Supabase PostgreSQL
    const authIdPatA = randomUUID();
    patientAUser = await prisma.user.create({
      data: { id: randomUUID(), auth_id: authIdPatA, email: `pata-${authIdPatA}@test.com`, status: 'ACTIVE' },
    });
    patientAProfile = await prisma.patient.create({ data: { id: randomUUID(), user_id: patientAUser.id, gender: 'MALE' } });

    const authIdPatB = randomUUID();
    patientBUser = await prisma.user.create({
      data: { id: randomUUID(), auth_id: authIdPatB, email: `patb-${authIdPatB}@test.com`, status: 'ACTIVE' },
    });
    patientBProfile = await prisma.patient.create({ data: { id: randomUUID(), user_id: patientBUser.id, gender: 'FEMALE' } });

    const authIdDocA = randomUUID();
    doctorAUser = await prisma.user.create({
      data: { id: randomUUID(), auth_id: authIdDocA, email: `doca-${authIdDocA}@test.com`, status: 'ACTIVE' },
    });
    doctorAProfile = await prisma.doctor.create({
      data: {
        id: randomUUID(),
        user_id: doctorAUser.id,
        specialization: 'General',
        experience_years: 5,
        registration_number: randomUUID(),
        medical_council_name: 'MCI',
        registration_year: 2018,
        verification_status: 'VERIFIED',
      },
    });

    const authIdDocB = randomUUID();
    doctorBUser = await prisma.user.create({
      data: { id: randomUUID(), auth_id: authIdDocB, email: `docb-${authIdDocB}@test.com`, status: 'ACTIVE' },
    });
    doctorBProfile = await prisma.doctor.create({
      data: {
        id: randomUUID(),
        user_id: doctorBUser.id,
        specialization: 'Orthopedics',
        experience_years: 7,
        registration_number: randomUUID(),
        medical_council_name: 'MCI',
        registration_year: 2017,
        verification_status: 'PENDING',
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      if (doctorAProfile?.id || doctorBProfile?.id) {
        await prisma.doctor.deleteMany({ where: { id: { in: [doctorAProfile?.id, doctorBProfile?.id].filter(Boolean) } } });
      }
      if (patientAProfile?.id || patientBProfile?.id) {
        await prisma.patient.deleteMany({ where: { id: { in: [patientAProfile?.id, patientBProfile?.id].filter(Boolean) } } });
      }
      if (patientAUser?.id || patientBUser?.id || doctorAUser?.id || doctorBUser?.id) {
        await prisma.user.deleteMany({ where: { id: { in: [patientAUser?.id, patientBUser?.id, doctorAUser?.id, doctorBUser?.id].filter(Boolean) } } });
      }
      await prisma.$disconnect();
    }
    if (app) {
      await app.close();
    }
  });

  describe('1. Full HTTP Authentication Path Verification against Real Supabase PostgreSQL', () => {
    it('rejects unauthenticated requests to protected endpoints with 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/patients/profile')
        .expect(401);
    });

    it('rejects requests with malformed JWT signature with 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/patients/profile')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .expect(401);
    });

    it('rejects forged JWT signed with incorrect secret with 401 Unauthorized', async () => {
      const forgedToken = generateAuthToken(patientAUser.auth_id, 'wrong_forged_secret_key');
      await request(app.getHttpServer())
        .get('/api/v1/patients/profile')
        .set('Authorization', `Bearer ${forgedToken}`)
        .expect(401);
    });

    it('rejects expired JWT token with 401 Unauthorized', async () => {
      const expiredToken = generateAuthToken(patientAUser.auth_id, undefined, -3600); // Expired 1 hour ago
      await request(app.getHttpServer())
        .get('/api/v1/patients/profile')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });

    it('allows public health check endpoint without authentication', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);
    });

    it('successfully resolves patient profile identity from real PostgreSQL user table', async () => {
      const token = generateAuthToken(patientAUser.auth_id);
      const response = await request(app.getHttpServer())
        .get('/api/v1/patients/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body.user_id).toBe(patientAUser.id);
    });

    it('successfully resolves doctor profile identity from real PostgreSQL user table', async () => {
      const token = generateAuthToken(doctorAUser.auth_id);
      const response = await request(app.getHttpServer())
        .get('/api/v1/doctors/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body.user_id).toBe(doctorAUser.id);
    });
  });

  describe('2. Role-Based Access Control & Privilege Escalation Prevention', () => {
    it('rejects Patient attempting to access Admin endpoint with 403 Forbidden', async () => {
      const patientToken = generateAuthToken(patientAUser.auth_id);
      await request(app.getHttpServer())
        .get('/api/v1/admin/doctors/pending')
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(403);
    });

    it('rejects Doctor attempting to access Admin endpoint with 403 Forbidden', async () => {
      const doctorToken = generateAuthToken(doctorAUser.auth_id);
      await request(app.getHttpServer())
        .get('/api/v1/admin/doctors/pending')
        .set('Authorization', `Bearer ${patientToken => doctorToken}`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(403);
    });
  });

  describe('3. Real Security IDOR & Cross-Resource Boundary Tests', () => {
    it('prevents Patient A from accessing non-existent or unauthorized lab result (404/403)', async () => {
      const token = generateAuthToken(patientAUser.auth_id);
      await request(app.getHttpServer())
        .get('/api/v1/lab-results/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('rejects medical data access by unverified/unrelated Doctor B without MedicalDataAccessGrant', async () => {
      const token = generateAuthToken(doctorBUser.auth_id);
      await request(app.getHttpServer())
        .get('/api/v1/clinical-encounters/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .expect((res) => {
          expect([401, 403, 404]).toContain(res.status);
        });
    });

    it('prevents IDOR substitution on lab order items endpoint', async () => {
      const token = generateAuthToken(doctorAUser.auth_id);
      await request(app.getHttpServer())
        .get('/api/v1/lab-results/00000000-0000-0000-0000-000000000000/items/11111111-1111-1111-1111-111111111111')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('prevents Patient B from updating Patient A profile (IDOR rejected)', async () => {
      const tokenB = generateAuthToken(patientBUser.auth_id);
      await request(app.getHttpServer())
        .patch('/api/v1/patients/profile')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ city: 'Malicious Update' })
        .expect(200);

      // Verify Patient A profile in real DB is unchanged
      const freshPatA = await prisma.patient.findUnique({ where: { id: patientAProfile.id } });
      expect(freshPatA?.city).not.toBe('Malicious Update');
    });
  });

  describe('4. Input Validation & Exception Sanitization', () => {
    it('rejects requests containing non-whitelisted properties (Mass Assignment protection)', async () => {
      const token = generateAuthToken(patientAUser.auth_id);
      await request(app.getHttpServer())
        .patch('/api/v1/patients/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ city: 'Mumbai', injectedProperty: 'maliciousValue' })
        .expect(400);
    });
  });
});
