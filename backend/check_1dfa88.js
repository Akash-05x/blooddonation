const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const request = await prisma.emergencyRequest.findFirst({
    where: { id: { contains: '1dfa88', mode: 'insensitive' } },
    include: { hospital: true }
  });
  console.log('Request:', JSON.stringify(request, null, 2));
}
run().catch(console.error).finally(() => prisma.$disconnect());
