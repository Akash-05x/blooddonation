const { PrismaClient } = require('@prisma/client');
const { promoteBackupDonor } = require('./src/services/donorRanking');
const prisma = new PrismaClient();

async function testReranking() {
  console.log('--- Starting Re-ranking Verification (Full Stack Trace) ---');
  
  try {
    const request = await prisma.emergencyRequest.findFirst({
        include: { hospital: true, assignments: true }
    });

    if (!request) {
      console.error('No requests found in DB to test with.');
      return;
    }

    console.log(`Testing with Request ID: ${request.id}`);

    const mockIo = {
      to: (room) => ({
        emit: (event, data) => {}
      })
    };

    await promoteBackupDonor(request.id, mockIo);
    console.log('Success!');

  } catch (err) {
    console.error('Caught Error:');
    console.error(err.message);
    console.error(err.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testReranking();
