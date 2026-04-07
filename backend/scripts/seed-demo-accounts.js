const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function main() {
  console.log('🌱 Seeding demo accounts...');

  const hospitalPassword = await hashPassword('akash123');
  const donorPassword = await hashPassword('anu123');
  const adminPassword = await hashPassword('Admin@1234');

  // 1. Create Admin User
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@bloodsystem.com' },
    update: {
      password: adminPassword,
      otp_verified: true,
    },
    create: {
      name: 'System Administrator',
      email: 'admin@bloodsystem.com',
      password: adminPassword,
      role: 'admin',
      otp_verified: true,
    },
  });

  // 2. Create Hospital User
  const hospitalUser = await prisma.user.upsert({
    where: { email: 'akashcrazy2004@gmail.com' },
    update: {
        password: hospitalPassword,
        otp_verified: true,
    },
    create: {
      name: 'Demo Hospital',
      email: 'akashcrazy2004@gmail.com',
      password: hospitalPassword,
      role: 'hospital',
      otp_verified: true,
      hospital: {
        create: {
          hospital_name: 'Demo Hospital',
          district: 'Thoothukudi',
          address: 'Demo Address, Thoothukudi',
          latitude: 8.7642,
          longitude: 78.1348,
          verified_status: 'approved',
        },
      },
    },
  });

  // 2. Create Donor User
  const donorUser = await prisma.user.upsert({
    where: { email: 'anushanushya2007@gmail.com' },
    update: {
        password: donorPassword,
        otp_verified: true,
    },
    create: {
      name: 'Demo Donor',
      email: 'anushanushya2007@gmail.com',
      password: donorPassword,
      role: 'donor',
      otp_verified: true,
      donor: {
        create: {
          name: 'Demo Donor',
          blood_group: 'O_POS',
          age: 25,
          gender: 'Male',
          latitude: 8.7139,
          longitude: 78.1311,
          district: 'Thoothukudi',
          availability_status: true,
        },
      },
    },
  });

  console.log('✅ Demo accounts seeded:');
  console.log(`   Admin:    ${adminUser.email}`);
  console.log(`   Hospital: ${hospitalUser.email}`);
  console.log(`   Donor:    ${donorUser.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
