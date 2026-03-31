const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: 'balaprasannavj2003@gmail.com',
    pass: 'jigy qgqe cwlt hjqk',
  },
});

transporter.verify((error, success) => {
  if (error) {
    console.log('❌ SMTP Error:', error.message);
  } else {
    console.log('✅ SMTP Connected! Gmail is working!');
  }
});