const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const hospitals = await prisma.hospital.findMany({
    include: { user: true }
  });
  console.log('Hospitals:', JSON.stringify(hospitals, null, 2));
}
run().catch(console.error).finally(() => prisma.$disconnect());
