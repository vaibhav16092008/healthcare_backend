import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding healthcare development database...');

  // 1. Patient Account
  const patientAuthId = '00000000-0000-0000-0000-000000000001';
  const patientUser = await prisma.user.upsert({
    where: { auth_id: patientAuthId },
    update: {},
    create: {
      auth_id: patientAuthId,
      email: 'patient@healthcare.com',
      phone: '+919876543210',
      status: 'ACTIVE',
    },
  });

  await prisma.patient.upsert({
    where: { user_id: patientUser.id },
    update: {},
    create: {
      user_id: patientUser.id,
      date_of_birth: new Date('1990-01-15'),
      gender: 'MALE',
      blood_group: 'O+',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      emergency_contact_name: 'Jane Doe',
      emergency_contact_phone: '+919876543211',
    },
  });
  console.log('✔ Patient seeded: patient@healthcare.com');

  // 2. Doctor Account
  const doctorAuthId = '00000000-0000-0000-0000-000000000002';
  const doctorUser = await prisma.user.upsert({
    where: { auth_id: doctorAuthId },
    update: {},
    create: {
      auth_id: doctorAuthId,
      email: 'doctor@healthcare.com',
      phone: '+919876543220',
      status: 'ACTIVE',
    },
  });

  const doctorProfile = await prisma.doctor.upsert({
    where: { user_id: doctorUser.id },
    update: {},
    create: {
      user_id: doctorUser.id,
      specialization: 'Cardiology',
      experience_years: 12,
      registration_number: 'MCI-2012-998877',
      medical_council_name: 'Medical Council of India',
      registration_year: 2012,
      verification_status: 'APPROVED',
      bio: 'Senior Cardiologist specializing in preventive heart health and diagnostics.',
      consultation_fee: 800.0,
      is_accepting_live_requests: true,
    },
  });

  // Doctor Clinic
  let clinic = await prisma.clinic.findFirst({ where: { name: 'Apollo Heart Center' } });
  if (!clinic) {
    clinic = await prisma.clinic.create({
      data: {
        name: 'Apollo Heart Center',
        owner_id: doctorUser.id,
        phone: '+912212345678',
        email: 'info@apolloheart.com',
      },
    });
  }

  let clinicLocation = await prisma.clinicLocation.findFirst({ where: { clinic_id: clinic.id } });
  if (!clinicLocation) {
    clinicLocation = await prisma.clinicLocation.create({
      data: {
        clinic_id: clinic.id,
        name: 'Downtown Clinic',
        address_line1: '101 Marine Drive',
        city: 'Mumbai',
        state: 'Maharashtra',
        postal_code: '400020',
        country: 'India',
        timezone: 'Asia/Kolkata',
      },
    });
  }

  let doctorClinic = await prisma.doctorClinic.findFirst({
    where: { doctor_id: doctorProfile.id, clinic_id: clinic.id },
  });
  if (!doctorClinic) {
    doctorClinic = await prisma.doctorClinic.create({
      data: {
        doctor_id: doctorProfile.id,
        clinic_id: clinic.id,
        status: 'ACTIVE',
      },
    });
  }
  console.log('✔ Doctor seeded: doctor@healthcare.com');

  // 3. Admin Account
  const adminAuthId = '00000000-0000-0000-0000-000000000003';
  const adminUser = await prisma.user.upsert({
    where: { auth_id: adminAuthId },
    update: {},
    create: {
      auth_id: adminAuthId,
      email: 'admin@healthcare.com',
      phone: '+919876543230',
      status: 'ACTIVE',
    },
  });

  await prisma.admin.upsert({
    where: { user_id: adminUser.id },
    update: {},
    create: {
      user_id: adminUser.id,
      department: 'Clinical Operations',
    },
  });
  console.log('✔ Admin seeded: admin@healthcare.com');

  console.log('Database seeding complete!');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

