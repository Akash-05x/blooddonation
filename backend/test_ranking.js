const prisma = require('./src/config/prisma');
const { initiateEmergencySearch } = require('./src/services/donorRanking');

async function test() {
  const request = await prisma.emergencyRequest.findFirst({ orderBy: { created_at: 'desc'} });
  console.log('Testing for request:', request.id);
  
  try {
    const res = await initiateEmergencySearch(request.id, null, {
      overrideLat: request.request_lat,
      overrideLng: request.request_lng,
      district: request.request_district
    });
    console.log('SUCCESS:', res);
  } catch(e) {
    console.error('ERROR IN INITIATE:', e);
  }
}

test().catch(console.error).finally(() => prisma.$disconnect());

test().catch(console.error).finally(() => prisma.$disconnect());
