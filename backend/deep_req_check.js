const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const requests = await prisma.emergencyRequest.findMany({
    include: { hospital: true }
  });
  console.log('Total Requests:', requests.length);
  requests.forEach(r => {
    console.log(`| ${r.id} | ${r.status} | ${r.hospital.hospital_name} | ${r.request_lat} | ${r.request_lng} |`);
  });
}
run().catch(console.error).finally(() => prisma.$disconnect());
