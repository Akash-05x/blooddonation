const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const requests = await prisma.emergencyRequest.findMany({
    where: { status: { notIn: ['completed', 'cancelled', 'failed', 'closed', 'expired'] } },
    select: { id: true, status: true, request_lat: true, request_lng: true, hospital: { select: { hospital_name: true } } }
  });
  console.log('| ID | Status | Name | Lat | Lng |');
  console.log('| --- | --- | --- | --- | --- |');
  requests.forEach(r => console.log(`| ${r.id} | ${r.status} | ${r.hospital.hospital_name} | ${r.request_lat} | ${r.request_lng} |`));
}
run().catch(console.error).finally(() => prisma.$disconnect());
