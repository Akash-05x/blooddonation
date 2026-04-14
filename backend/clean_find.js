const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const hospitals = await prisma.hospital.findMany({
    include: { user: true }
  });
  console.log('| Name | District | Lat | Lng | Email |');
  console.log('| --- | --- | --- | --- | --- |');
  hospitals.forEach(h => {
    console.log(`| ${h.hospital_name} | ${h.district} | ${h.latitude} | ${h.longitude} | ${h.user.email} |`);
  });
}
run().catch(console.error).finally(() => prisma.$disconnect());
