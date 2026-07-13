const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    include: {
      hospital: true,
      donor: true
    }
  });

  console.log('--- Users ---');
  users.forEach(u => {
    console.log(`User: ${u.name} (Role: ${u.role}, ID: ${u.id})`);
    if (u.hospital) {
      console.log(`  Hospital: ${u.hospital.hospital_name}, District: ${u.hospital.district}, Lat: ${u.hospital.latitude}, Lng: ${u.hospital.longitude}`);
    }
    if (u.donor) {
      console.log(`  Donor: ${u.donor.name}, District: ${u.donor.district}, Lat: ${u.donor.latitude}, Lng: ${u.donor.longitude}, Status: ${u.donor.availability_status}`);
    }
  });

  const requests = await prisma.emergencyRequest.findMany();
  console.log('\n--- Requests ---');
  console.log(`Total Requests: ${requests.length}`);
  requests.forEach(r => {
    console.log(`Request: ${r.id}, Status: ${r.status}, Blood: ${r.blood_group}`);
  });

  const history = await prisma.donationHistory.findMany();
  console.log('\n--- History ---');
  console.log(`Total History: ${history.length}`);
}

main().catch(err => console.error(err)).finally(() => prisma.$disconnect());
