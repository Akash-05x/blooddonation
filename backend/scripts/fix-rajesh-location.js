const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const hospitals = await prisma.hospital.findMany({
    where: {
      OR: [
        { hospital_name: { contains: 'Rajesh', mode: 'insensitive' } },
        { hospital_name: { contains: 'Akash', mode: 'insensitive' } }
      ]
    }
  });

  for (const h of hospitals) {
    await prisma.hospital.update({
      where: { id: h.id },
      data: { latitude: 8.7642, longitude: 78.1348, district: 'Thoothukudi' }
    });
    
    // Also update all active/created requests for this hospital
    const updatedReqs = await prisma.emergencyRequest.updateMany({
      where: { 
        hospital_id: h.id, 
        status: { in: ['created', 'active', 'donor_search', 'awaiting_confirmation', 'awaiting_assignment', 'assigned', 'in_transit'] }
      },
      data: { request_lat: 8.7642, request_lng: 78.1348, request_district: 'Thoothukudi' }
    });
    console.log(`✅ Updated hospital ${h.hospital_name} and ${updatedReqs.count} active requests.`);
  }
}
run().catch(console.error).finally(() => prisma.$disconnect());
