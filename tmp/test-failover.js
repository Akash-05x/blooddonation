const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { runFailover } = require('../backend/src/services/failureDetector');
const { promoteBackupDonor } = require('../backend/src/services/donorRanking');

async function testFailover() {
  console.log('--- Starting Failover Verification ---');

  // 1. Find an active request with a primary and backup donor
  const request = await prisma.emergencyRequest.findFirst({
    where: { status: 'in_transit' },
    include: {
      assignments: {
        include: { donor: { include: { user: true } } }
      }
    }
  });

  if (!request) {
    console.log('No active in_transit request found for testing. Please create one manually.');
    process.exit(0);
  }

  const primary = request.assignments.find(a => a.role === 'primary');
  const backup = request.assignments.find(a => a.role === 'backup');

  if (!primary || !backup) {
    console.log('Request found but does not have both primary and backup donors.');
    process.exit(0);
  }

  console.log(`Primary Donor: ${primary.donor.user.name}`);
  console.log(`Backup Donor: ${backup.donor.user.name}`);
  console.log(`Request ID: ${request.id}`);

  // 2. Simulate Heartbeat Failure by calling runFailover
  console.log('Simulating failover for primary donor...');
  try {
    const result = await promoteBackupDonor(request.id, null); // Mocking IO as null
    console.log('Failover successful!');
    console.log('New status:', result.request?.status);
    
    // 3. Verify Database State
    const updatedRequest = await prisma.emergencyRequest.findUnique({
      where: { id: request.id },
      include: { assignments: true, history: true }
    });

    const newPrimary = updatedRequest.assignments.find(a => a.role === 'primary' && a.status === 'accepted');
    const oldPrimary = updatedRequest.assignments.find(a => a.donor_id === primary.donor_id);
    const failureLog = updatedRequest.history.find(h => h.donor_id === primary.donor_id && h.status === 'failed');

    if (newPrimary && newPrimary.donor_id === backup.donor_id) {
        console.log('✅ PASS: Backup promoted to primary.');
    } else {
        console.log('❌ FAIL: Backup NOT promoted correctly.');
    }

    if (oldPrimary && oldPrimary.status === 'failed') {
        console.log('✅ PASS: Old primary marked as failed.');
    } else {
        console.log('❌ FAIL: Old primary status incorrect.');
    }

    if (failureLog) {
        console.log('✅ PASS: Failure logged in DonationHistory.');
    } else {
        console.log('❌ FAIL: Failure NOT logged in DonationHistory.');
    }

  } catch (err) {
    console.error('Failover simulation failed:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

testFailover();
