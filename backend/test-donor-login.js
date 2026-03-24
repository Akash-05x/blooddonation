const fs = require('fs');

async function testDonor() {
  const result = {};
  try {
    const ts = Date.now();
    const donorEmail = `donor_${ts}@example.com`;
    const donorName = `Test Donor ${ts}`;
    const password = 'password123';
    const BASE_URL = 'http://localhost:5000/api';

    const resReg = await fetch(`${BASE_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: donorName,
        email: donorEmail,
        password: password,
        role: 'donor',
        gender: 'Male',
        dob: '1995-01-01',
        age: 30,
        blood_group: 'O_POS',
        available_time: 'Any',
        consent_declaration: true
      })
    });
    result.register = await resReg.json();

    const resLogin = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: donorEmail,
        password: password
      })
    });
    result.login = await resLogin.json();

    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    result.userInDB = await prisma.user.findUnique({
      where: { email: donorEmail },
      include: { donor: true }
    });

  } catch (err) {
    result.error = err.message;
  }
  
  fs.writeFileSync('test-out.json', JSON.stringify(result, null, 2));
}

testDonor();
