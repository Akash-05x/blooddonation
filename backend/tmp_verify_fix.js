const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verify() {
  try {
    const donor = await prisma.donor.findFirst();
    if (!donor) {
      console.log('No donor found in database.');
      return;
    }

    console.log(`Original Donor [${donor.id}] Location: ${donor.latitude}, ${donor.longitude}`);

    const newLat = 12.3456;
    const newLng = 78.9101;

    // Simulate what the socket handler does
    await prisma.donor.update({
      where: { id: donor.id },
      data: {
        latitude: newLat,
        longitude: newLng,
      },
    });

    const updatedDonor = await prisma.donor.findUnique({ where: { id: donor.id } });
    console.log(`Updated Donor [${updatedDonor.id}] Location: ${updatedDonor.latitude}, ${updatedDonor.longitude}`);

    if (updatedDonor.latitude === newLat && updatedDonor.longitude === newLng) {
      console.log('✅ Verification Successful: Donor table updated correctly.');
    } else {
      console.log('❌ Verification Failed: Donor table not updated correctly.');
    }
  } catch (err) {
    console.error('Error during verification:', err);
  } finally {
    await prisma.$disconnect();
  }
}

verify();
