const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const user = await prisma.user.findFirst({
    where: { email: 'rajeshkumarmay2000@gmail.com' },
    include: { hospital: true }
  });
  console.log('User:', JSON.stringify(user, null, 2));
}
run().catch(console.error).finally(() => prisma.$disconnect());
