/**
 * Database Seed Script
 * Creates one admin, one hospital, and one donor for testing.
 * Run: npm run db:seed
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  const SALT      = 12;
  const adminPass = await bcrypt.hash('Admin@1234',    SALT);
  const hospPass  = await bcrypt.hash('Hospital@1234', SALT);
  const donorPass = await bcrypt.hash('Donor@1234',    SALT);

  // ── Admin ──────────────────────────────────────────────────────────────────
  const admin = await prisma.user.upsert({
    where:  { email: 'admin@bloodsystem.com' },
    update: {},
    create: {
      name:         'System Admin',
      email:        'admin@bloodsystem.com',
      password:     adminPass,
      role:         'admin',
      phone:        '9000000001',
      otp_verified: true,
    },
  });
  console.log(`✅ Admin   : ${admin.email}`);

  // ── System Configuration ───────────────────────────────────────────────────
  const cfg = await prisma.systemConfiguration.findFirst();
  if (!cfg) {
    await prisma.systemConfiguration.create({
      data: {
        distance_radius:             50,
        ranking_weight_response:     0.5,
        ranking_weight_distance:     0.3,
        ranking_weight_history:      0.2,
        gps_timeout_minutes:         2,
        notification_expiry_minutes: 10,
      },
    });
    console.log('✅ System config created.');
  }

  // ── Hospital ───────────────────────────────────────────────────────────────
  const hospUser = await prisma.user.upsert({
    where:  { email: 'hospital@demo.com' },
    update: {},
    create: {
      name:         'City General Hospital',
      email:        'hospital@demo.com',
      password:     hospPass,
      role:         'hospital',
      phone:        '9000000002',
      otp_verified: true,
    },
  });

  await prisma.hospital.upsert({
    where:  { user_id: hospUser.id },
    update: {},
    create: {
      user_id:        hospUser.id,
      hospital_name:  'City General Hospital',
      address:        '123 Medical Lane, Chennai, TN 600001',
      latitude:       13.0604,
      longitude:      80.2496,
      verified_status:'approved',
    },
  });
  console.log(`✅ Hospital : ${hospUser.email}  (pre-verified)`);

  // ── Donor ──────────────────────────────────────────────────────────────────
  const donorUser = await prisma.user.upsert({
    where:  { email: 'donor@demo.com' },
    update: {},
    create: {
      name:         'Aryan Sharma',
      email:        'donor@demo.com',
      password:     donorPass,
      role:         'donor',
      phone:        '9000000003',
      otp_verified: true,
    },
  });

  await prisma.donor.upsert({
    where:  { user_id: donorUser.id },
    update: {},
    create: {
      user_id:             donorUser.id,
      name:                'Aryan Sharma',
      blood_group:         'O_POS',
      age:                 25,
      latitude:            13.0750,   // ~1.6 km from demo hospital
      longitude:           80.2700,
      reliability_score:   95,
      donation_count:      5,
      availability_status: true,
      vacation_mode:       false,
    },
  });
  console.log(`✅ Donor    : ${donorUser.email}  (O+)`);

  console.log('\n🎉 Seed complete!\n');
  console.log('─────────────────────────────────────────');
  console.log('  Role      │ Email                  │ Password');
  console.log('────────────┼────────────────────────┼─────────────');
  console.log('  Admin     │ admin@bloodsystem.com  │ Admin@1234');
  console.log('  Hospital  │ hospital@demo.com      │ Hospital@1234');
  console.log('  Donor     │ donor@demo.com         │ Donor@1234');
  console.log('─────────────────────────────────────────\n');
}

main()
  .catch(e => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(async () => prisma.$disconnect());
