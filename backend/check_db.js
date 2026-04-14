const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const hospitals = await prisma.hospital.findMany();
  const donors = await prisma.donor.findMany();
  const requests = await prisma.emergencyRequest.findMany({ include: { hospital: true } });
  console.log('Hospitals:', JSON.stringify(hospitals, null, 2));
  console.log('Donors:', JSON.stringify(donors, null, 2));
  console.log('Requests:', JSON.stringify(requests, null, 2));
}
run().catch(console.error).finally(() => prisma.$disconnect());
