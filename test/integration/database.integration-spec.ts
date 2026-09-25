import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

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

describe('Real PostgreSQL Integration Test Suite (Phase 13)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    const rawUrl = process.env.TEST_DATABASE_URL;
    if (!rawUrl) {
      throw new Error('TEST_DATABASE_URL must be defined for real PostgreSQL integration tests.');
    }

    const { encodedUrl, hostname } = parseAndEncodeDbUrl(rawUrl);

    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      throw new Error(`TEST_DATABASE_URL points to local host (${hostname}). Real Supabase PostgreSQL database required.`);
    }

    prisma = new PrismaClient({
      datasources: {
        db: {
          url: encodedUrl,
        },
      },
    });

    // Enforce real PostgreSQL connection. Fails test run if database is unreachable.
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  describe('1. Real PostgreSQL Connection & Schema Verification', () => {
    it('connects to real PostgreSQL server and executes raw SELECT 1', async () => {
      const result: any[] = await prisma.$queryRaw`SELECT 1 as connected`;
      expect(result[0].connected).toBe(1);
    });

    it('verifies key domain tables exist in information_schema', async () => {
      const tables: any[] = await prisma.$queryRaw`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema='public' AND table_type='BASE TABLE'
      `;
      const tableNames = tables.map((t) => t.table_name);
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('patients');
      expect(tableNames).toContain('doctors');
      expect(tableNames).toContain('appointments');
      expect(tableNames).toContain('clinical_encounters');
      expect(tableNames).toContain('lab_results');
    });
  });

  describe('2. Real PostgreSQL Domain Relations & Constraints', () => {
    it('verifies User and Patient ownership relations in real PostgreSQL', async () => {
      const authId = randomUUID();
      const user = await prisma.user.create({
        data: {
          id: randomUUID(),
          auth_id: authId,
          email: `patient-${authId}@example.com`,
          status: 'ACTIVE',
        },
      });

      const patient = await prisma.patient.create({
        data: {
          id: randomUUID(),
          user_id: user.id,
          gender: 'FEMALE',
          city: 'Mumbai',
        },
      });

      expect(patient.user_id).toBe(user.id);

      await prisma.patient.delete({ where: { id: patient.id } });
      await prisma.user.delete({ where: { id: user.id } });
    });

    it('verifies Doctor registration_number uniqueness constraint in PostgreSQL', async () => {
      const regNum = `REG-${randomUUID()}`;
      const user1 = await prisma.user.create({
        data: { id: randomUUID(), auth_id: randomUUID(), status: 'ACTIVE' },
      });

      const doctor1 = await prisma.doctor.create({
        data: {
          id: randomUUID(),
          user_id: user1.id,
          specialization: 'Cardiology',
          experience_years: 10,
          registration_number: regNum,
          medical_council_name: 'Medical Council of India',
          registration_year: 2015,
          verification_status: 'VERIFIED',
        },
      });

      const user2 = await prisma.user.create({
        data: { id: randomUUID(), auth_id: randomUUID(), status: 'ACTIVE' },
      });

      await expect(
        prisma.doctor.create({
          data: {
            id: randomUUID(),
            user_id: user2.id,
            specialization: 'General',
            experience_years: 5,
            registration_number: regNum, // Duplicate registration number
            medical_council_name: 'Medical Council of India',
            registration_year: 2020,
            verification_status: 'VERIFIED',
          },
        })
      ).rejects.toThrow();

      await prisma.doctor.delete({ where: { id: doctor1.id } });
      await prisma.user.delete({ where: { id: user1.id } });
      await prisma.user.delete({ where: { id: user2.id } });
    });
  });

  describe('3. Real PostgreSQL Transaction Rollback & Atomicity', () => {
    it('rolls back transaction completely when audit logging or nested operation fails', async () => {
      const testAuthId = randomUUID();

      await expect(
        prisma.$transaction(async (tx) => {
          await tx.user.create({
            data: {
              id: randomUUID(),
              auth_id: testAuthId,
              status: 'ACTIVE',
            },
          });

          throw new Error('Simulated post-mutation failure for rollback test');
        })
      ).rejects.toThrow('Simulated post-mutation failure for rollback test');

      const foundUser = await prisma.user.findUnique({
        where: { auth_id: testAuthId },
      });
      expect(foundUser).toBeNull();
    });
  });

  describe('4. Real PostgreSQL Concurrency & Double Booking Prevention', () => {
    it('prevents concurrent double booking of the exact same doctor slot under Serializable isolation', async () => {
      const userOwner = await prisma.user.create({ data: { id: randomUUID(), auth_id: randomUUID(), status: 'ACTIVE' } });
      const userDoc = await prisma.user.create({ data: { id: randomUUID(), auth_id: randomUUID(), status: 'ACTIVE' } });
      const doctor = await prisma.doctor.create({
        data: {
          id: randomUUID(),
          user_id: userDoc.id,
          specialization: 'Neurology',
          experience_years: 8,
          registration_number: randomUUID(),
          medical_council_name: 'Medical Council',
          registration_year: 2016,
          verification_status: 'VERIFIED',
        },
      });
      const clinic = await prisma.clinic.create({
        data: { id: randomUUID(), owner_id: userOwner.id, name: 'Concurrency Clinic', status: 'ACTIVE' },
      });
      const doctorClinic = await prisma.doctorClinic.create({
        data: { id: randomUUID(), doctor_id: doctor.id, clinic_id: clinic.id, status: 'ACTIVE' },
      });
      const clinicLocation = await prisma.clinicLocation.create({
        data: {
          id: randomUUID(),
          clinic_id: clinic.id,
          name: 'Main Loc',
          address_line1: '123 St',
          city: 'Mumbai',
          state: 'Maharashtra',
          postal_code: '400001',
        },
      });

      const userPat1 = await prisma.user.create({ data: { id: randomUUID(), auth_id: randomUUID(), status: 'ACTIVE' } });
      const patient1 = await prisma.patient.create({ data: { id: randomUUID(), user_id: userPat1.id, gender: 'MALE' } });

      const userPat2 = await prisma.user.create({ data: { id: randomUUID(), auth_id: randomUUID(), status: 'ACTIVE' } });
      const patient2 = await prisma.patient.create({ data: { id: randomUUID(), user_id: userPat2.id, gender: 'FEMALE' } });

      const appointmentDateStr = '2026-10-01';
      const startAt = new Date('2026-10-01T09:00:00Z');
      const endAt = new Date('2026-10-01T09:30:00Z');

      const bookSlot = async (patientId: string) => {
        return prisma.$transaction(async (tx) => {
          const existing = await tx.appointment.findFirst({
            where: {
              doctor_clinic_id: doctorClinic.id,
              clinic_location_id: clinicLocation.id,
              appointment_date: appointmentDateStr,
              start_at: startAt,
              status: { in: ['BOOKED', 'COMPLETED'] },
            },
          });

          if (existing) {
            throw new Error('Slot already booked');
          }

          return tx.appointment.create({
            data: {
              id: randomUUID(),
              patient_id: patientId,
              doctor_clinic_id: doctorClinic.id,
              clinic_location_id: clinicLocation.id,
              appointment_date: appointmentDateStr,
              start_at: startAt,
              end_at: endAt,
              status: 'BOOKED',
            },
          });
        }, { isolationLevel: 'Serializable' });
      };

      const results = await Promise.allSettled([
        bookSlot(patient1.id),
        bookSlot(patient2.id),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly one booking should succeed
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      // Verify database state: only 1 appointment persisted
      const persistedAppointments = await prisma.appointment.findMany({
        where: { doctor_clinic_id: doctorClinic.id },
      });
      expect(persistedAppointments.length).toBe(1);

      // Clean up test data
      await prisma.appointment.deleteMany({ where: { doctor_clinic_id: doctorClinic.id } });
      await prisma.clinicLocation.delete({ where: { id: clinicLocation.id } });
      await prisma.doctorClinic.delete({ where: { id: doctorClinic.id } });
      await prisma.clinic.delete({ where: { id: clinic.id } });
      await prisma.patient.deleteMany({ where: { id: { in: [patient1.id, patient2.id] } } });
      await prisma.doctor.delete({ where: { id: doctor.id } });
      await prisma.user.deleteMany({ where: { id: { in: [userOwner.id, userDoc.id, userPat1.id, userPat2.id] } } });
    });
  });
});
