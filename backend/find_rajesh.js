const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const hospitals = await prisma.hospital.findMany({
    where: {
      OR: [
        { hospital_name: { contains: 'Rajesh', mode: 'insensitive' } },
        { hospital_name: { contains: 'Akash', mode: 'insensitive' } },
        { user: { name: { contains: 'Rajesh', mode: 'insensitive' } } },
        { user: { name: { contains: 'Akash', mode: 'insensitive' } } }
      ]
    },
    include: { user: true }
  });
  console.log('Result:', JSON.stringify(hospitals, null, 2));
}
run().catch(console.error).finally(() => prisma.$disconnect());
