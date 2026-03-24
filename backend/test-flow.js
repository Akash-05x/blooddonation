const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

async function testFlow() {
  try {
    console.log('--- Testing Donor Flow ---');
    const donorEmail = 'testdonor1@example.com';
    const resDonor = await axios.post(`${BASE_URL}/auth/register`, {
      name: 'Test Donor',
      email: donorEmail,
      password: 'password123',
      role: 'donor',
      gender: 'Male',
      dob: '1995-01-01',
      age: 30,
      blood_group: 'O+',
      available_time: 'Any',
      consent_declaration: true
    });
    console.log('Donor Registration:', resDonor.data);

    // Will require OTP next...

    console.log('\n--- Testing Hospital Flow ---');
    const hospitalEmail = 'testhospital1@example.com';
    const resHospital = await axios.post(`${BASE_URL}/auth/register`, {
      name: 'Test Hospital',
      email: hospitalEmail,
      password: 'password123',
      role: 'hospital',
      hospital_name: 'Test Hospital',
      hospital_district: 'Test City',
      hospital_address: '123 Main St',
      hospital_type: 'Govt',
      authorized_person_name: 'Dr. Smith'
    });
    console.log('Hospital Registration:', resHospital.data);

    // Try logging in hospital immediately
    try {
      await axios.post(`${BASE_URL}/auth/login`, {
        email: hospitalEmail,
        password: 'password123'
      });
    } catch (err) {
      console.log('Hospital Login before approval (expected failure):', err.response?.data);
    }
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testFlow();
