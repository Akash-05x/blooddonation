const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const requests = await prisma.emergencyRequest.findMany({
    where: { status: { in: ['assigned', 'in_transit', 'awaiting_confirmation'] } },
    select: {
      id: true,
      status: true,
      hospital: { select: { user: { select: { email: true } } } },
      assignments: { select: { donor: { select: { user: { select: { email: true } } } } } }
    }
  });
  console.log(JSON.stringify(requests, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
