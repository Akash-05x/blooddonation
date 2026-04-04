const { PrismaClient } = require('@prisma/client');
const { promoteBackupDonor } = require('./src/services/donorRanking');
const prisma = new PrismaClient();

async function testReranking() {
  console.log('--- Starting Re-ranking Verification ---');
  
  try {
    // 1. Find or create a test emergency request
    let request = await prisma.emergencyRequest.findFirst({
      where: { status: 'in_transit' },
      include: { hospital: true, assignments: true }
    });

    if (!request) {
      console.log('No active in-transit request found. Please run a manual test in the UI first or seed data.');
      // return;
      // Fallback: search for any request
      request = await prisma.emergencyRequest.findFirst({
        include: { hospital: true, assignments: true }
      });
    }

    if (!request) {
      console.error('No requests found in DB to test with.');
      return;
    }

    console.log(`Testing with Request ID: ${request.id}`);
    console.log(`Current Status: ${request.status}`);
    console.log('Current Assignments:', request.assignments.map(a => `${a.role}: ${a.status}`));

    // 2. Mock Socket.io
    const mockIo = {
      to: (room) => ({
        emit: (event, data) => {
          console.log(`[Socket Mock] Emitted to ${room}: ${event}`, data);
        }
      })
    };

    // 3. Call promoteBackupDonor
    console.log('\n--- Calling promoteBackupDonor ---');
    const newPrimary = await promoteBackupDonor(request.id, mockIo);
    
    console.log('\n--- Verification Results ---');
    console.log('New Primary Assignment:', {
      donor_id: newPrimary.donor_id,
      role: newPrimary.role,
      status: newPrimary.status,
      score: newPrimary.score
    });

    // 4. Check all assignments for this request
    const allAssignments = await prisma.donorAssignment.findMany({
      where: { request_id: request.id },
      include: { donor: { include: { user: true } } },
      orderBy: { score: 'desc' }
    });

    console.log('\nUpdated Assignment Rankings:');
    allAssignments.forEach((a, i) => {
      console.log(`${i+1}. ${a.donor.user.name} | Role: ${a.role} | Status: ${a.status} | Score: ${a.score}`);
    });

    // 5. Assertions (Visual or programmatic)
    const primary = allAssignments.find(a => a.role === 'primary');
    const backup = allAssignments.find(a => a.role === 'backup');

    if (primary && primary.status === 'accepted') {
      console.log('\n✅ PASS: New primary is correctly marked as accepted.');
    } else {
      console.log('\n❌ FAIL: Primary not found or wrong status.');
    }

    if (allAssignments.length > 1 && !backup) {
      console.log('❌ FAIL: Backup not assigned despite having multiple confirmed donors.');
    } else if (backup) {
      console.log('✅ PASS: Backup correctly identified.');
    }

  } catch (err) {
    console.error('Test Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

testReranking();
