import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function bootstrap() {
  const authId = process.argv[2];
  const department = process.argv[3] || 'System Admin';

  if (!authId) {
    console.error('Usage: npx tsx scripts/bootstrap-admin.ts <authId> [department]');
    process.exit(1);
  }

  try {
    const user = await prisma.user.findUnique({ where: { auth_id: authId } });
    if (!user) {
      console.error(`User with authId ${authId} not found in public.users.`);
      console.error('The user must first onboard via POST /api/v1/auth/onboarding');
      process.exit(1);
    }

    const existingAdmin = await prisma.admin.findUnique({ where: { user_id: user.id } });
    if (existingAdmin) {
      console.log('Admin profile already exists for this user.');
      process.exit(0);
    }

    await prisma.admin.create({
      data: {
        user_id: user.id,
        department: department
      }
    });

    console.log(`Successfully provisioned ADMIN role for authId ${authId}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

bootstrap();
