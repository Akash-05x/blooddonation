const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const requests = await prisma.emergencyRequest.findMany({
    select: { id: true, status: true, hospital_id: true }
  });
  console.log('| ID | Status | Hospital ID |');
  console.log('| --- | --- | --- |');
  requests.forEach(r => console.log(`| ${r.id} | ${r.status} | ${r.hospital_id} |`));
}
run().catch(console.error).finally(() => prisma.$disconnect());
