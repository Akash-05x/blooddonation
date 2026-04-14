const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const hospitals = await prisma.hospital.findMany({ select: { hospital_name: true, latitude: true, longitude: true, district: true } });
  const donors = await prisma.donor.findMany({ select: { name: true, latitude: true, longitude: true, district: true } });
  console.log('--- HOSPITALS ---');
  hospitals.forEach(h => console.log(`${h.hospital_name} (${h.district}): ${h.latitude}, ${h.longitude}`));
  console.log('--- DONORS ---');
  donors.forEach(d => console.log(`${d.name} (${d.district}): ${d.latitude}, ${d.longitude}`));
}
run().catch(console.error).finally(() => prisma.$disconnect());
