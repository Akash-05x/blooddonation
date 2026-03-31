const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verify() {
  try {
    const hospital = await prisma.hospital.findFirst();
    if (!hospital) {
      console.log('No hospital found in database.');
      return;
    }

    console.log(`Original Hospital [${hospital.id}] Location: ${hospital.latitude}, ${hospital.longitude}`);

    const newLat = 13.0827; // Chennai
    const newLng = 80.2707;

    await prisma.hospital.update({
      where: { id: hospital.id },
      data: {
        latitude:  newLat,
        longitude: newLng,
      },
    });

    const updated = await prisma.hospital.findUnique({ where: { id: hospital.id } });
    console.log(`Updated Hospital [${updated.id}] Location: ${updated.latitude}, ${updated.longitude}`);

    if (updated.latitude === newLat && updated.longitude === newLng) {
      console.log('✅ Verification Successful: Hospital profile location updated.');
    } else {
      console.log('❌ Verification Failed: Hospital profile location not updated.');
    }
  } catch (err) {
    console.error('Error during verification:', err);
  } finally {
    await prisma.$disconnect();
  }
}

verify();
