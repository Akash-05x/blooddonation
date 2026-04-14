const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  // Update ALL hospitals in Thoothukudi district that have Cuddalore coordinates
  const hospitals = await prisma.hospital.updateMany({
    where: {
      district: { contains: 'Thoothukudi', mode: 'insensitive' },
      latitude: { gt: 10 } // Cuddalore is ~11.7
    },
    data: {
      latitude: 8.7642,
      longitude: 78.1348
    }
  });
  
  // Update ALL requests that have Cuddalore coordinates
  const requests = await prisma.emergencyRequest.updateMany({
    where: {
      request_lat: { gt: 10 } 
    },
    data: {
      request_lat: 8.7642,
      request_lng: 78.1348,
      request_district: 'Thoothukudi'
    }
  });

  // Also fix Rajesh and Demo donors just in case
  const donors = await prisma.donor.updateMany({
    where: {
      district: { contains: 'Thoothukudi', mode: 'insensitive' },
      latitude: { gt: 10 }
    },
    data: {
      latitude: 8.7139,
      longitude: 78.1311
    }
  });

  console.log(`✅ Fixed ${hospitals.count} hospitals, ${requests.count} requests, and ${donors.count} donors.`);
}
run().catch(console.error).finally(() => prisma.$disconnect());
