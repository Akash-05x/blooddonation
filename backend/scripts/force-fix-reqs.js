const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const updatedReqs = await prisma.emergencyRequest.updateMany({
    where: { 
      status: { notIn: ['completed', 'cancelled', 'failed', 'closed', 'expired'] }
    },
    data: { 
      request_lat: 8.7642, 
      request_lng: 78.1348, 
      request_district: 'Thoothukudi' 
    }
  });
  console.log(`✅ Force-updated ${updatedReqs.count} non-terminal requests to Thoothukudi.`);
}
run().catch(console.error).finally(() => prisma.$disconnect());
