const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const requestId = 'f42730e7-6335-4d9f-9428-1dfa88701918';
  const updatedReq = await prisma.emergencyRequest.update({
    where: { id: requestId },
    data: { 
      request_lat: 8.7642, 
      request_lng: 78.1348, 
      request_district: 'Thoothukudi' 
    }
  });
  
  // Also fix the hospital profile just in case it wasn't caught
  const updatedHosp = await prisma.hospital.update({
    where: { id: updatedReq.hospital_id },
    data: { latitude: 8.7642, longitude: 78.1348, district: 'Thoothukudi' }
  });
  
  console.log(`✅ Surgical fix complete for Request ${requestId} and Hospital ${updatedHosp.hospital_name}`);
}
run().catch(console.error).finally(() => prisma.$disconnect());
