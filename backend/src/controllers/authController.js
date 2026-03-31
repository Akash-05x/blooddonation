const prisma = require('../config/prisma');
const { hashPassword, comparePassword } = require('../utils/bcrypt');
const { signToken } = require('../utils/jwt');
const { createOTP, validateOTP } = require('../utils/otp');
const { sendOTPEmail } = require('../utils/mailer');

// ─── POST /api/register ────────────────────────────────────────────────────
async function register(req, res, next) {
  try {
    const {
      name, email, phone, password, role,
      gender, dob, age, body_weight,
      blood_group, major_illness, taking_medication_date,
      last_donation_date, recent_surgery_date, is_pregnant,
      district, address, latitude, longitude,
      available_time, willing_to_travel,
      id_proof_type, id_proof_no, consent_declaration,
      medical_notes,
      hospital_name,
      hospital_district, hospital_address, telephone, official_email,
      hospital_latitude, hospital_longitude, hospital_type,
      controlling_dept, hospital_category,
      clinical_reg_no, issue_date, expiry_date, issuing_authority,
      nabh_accreditation_no, abdm_facility_id,
      authorized_person_name, authorized_designation, authorized_email,
    } = req.body;

    if (!email && !phone) {
      return res.status(400).json({ success: false, message: 'Email or phone number is required.' });
    }

    if (email) {
      const existingEmail = await prisma.user.findUnique({ where: { email } });
      if (existingEmail) return res.status(409).json({ success: false, message: 'Email already registered.' });
    }
    if (phone) {
      const existingPhone = await prisma.user.findUnique({ where: { phone } });
      if (existingPhone) return res.status(409).json({ success: false, message: 'Phone number already registered.' });
    }

    const hashed = await hashPassword(password);
    const io = req.app.get('io');

    if (role === 'hospital') {
      const pendingHospital = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            name: hospital_name,
            email: email || null,
            phone: phone || null,
            password: hashed,
            role,
            otp_verified: false,
          },
        });

        return tx.pendingHospital.create({
          data: {
            user_id: newUser.id,
            hospital_name,
            email: email || null,
            phone: phone || null,
            password: hashed,
            district: hospital_district || '',
            address: hospital_address || address || '',
            telephone: telephone || '',
            official_email: official_email || email || '',
            latitude: hospital_latitude ? parseFloat(hospital_latitude) : (latitude ? parseFloat(latitude) : 0),
            longitude: hospital_longitude ? parseFloat(hospital_longitude) : (longitude ? parseFloat(longitude) : 0),
            hospital_type: hospital_type || 'Govt',
            controlling_dept: controlling_dept || null,
            hospital_category: hospital_category || null,
            clinical_reg_no: clinical_reg_no || null,
            issue_date: issue_date ? new Date(issue_date) : null,
            expiry_date: expiry_date ? new Date(expiry_date) : null,
            issuing_authority: issuing_authority || null,
            nabh_accreditation_no: nabh_accreditation_no || null,
            abdm_facility_id: abdm_facility_id || null,
            authorized_person_name: authorized_person_name || '',
            authorized_designation: authorized_designation || '',
            authorized_email: authorized_email || '',
          },
        });
      });

      const otpEmail = email || official_email;
      if (otpEmail) {
        const { otp } = await createOTP(pendingHospital.user_id, 'verification');
        await sendOTPEmail(otpEmail, otp, 'verification');
      }

      return res.status(201).json({
        success: true,
        requiresOTP: true,
        userId: pendingHospital.user_id,
        message: 'Registration submitted. Please verify your email with the OTP sent.',
      });
    }

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name,
          email: email || null,
          phone: phone || null,
          password: hashed,
          role,
        },
      });

      if (role === 'donor') {
        await tx.donor.create({
          data: {
            user_id: newUser.id,
            name: newUser.name,
            blood_group: blood_group || 'O_POS',
            age: parseInt(age) || 18,
            gender: gender || 'Male',
            dob: dob ? new Date(dob) : null,
            body_weight: body_weight ? parseFloat(body_weight) : null,
            major_illness: major_illness || null,
            taking_medication_date: taking_medication_date ? new Date(taking_medication_date) : null,
            last_donation_date: last_donation_date ? new Date(last_donation_date) : null,
            recent_surgery_date: recent_surgery_date ? new Date(recent_surgery_date) : null,
            is_pregnant: is_pregnant === true || is_pregnant === 'true' || is_pregnant === 'Yes',
            district: district || null,
            address: address || null,
            latitude: latitude ? parseFloat(latitude) : null,
            longitude: longitude ? parseFloat(longitude) : null,
            available_time: available_time || 'Any',
            willing_to_travel: willing_to_travel === true || willing_to_travel === 'true' || willing_to_travel === 'Yes',
            id_proof_type: id_proof_type || null,
            id_proof_no: id_proof_no || null,
            consent_declaration: consent_declaration === true || consent_declaration === 'true',
            medical_notes: medical_notes || null,
          },
        });
      }
      return newUser;
    });

    if (io) {
      io.to('admin').emit('new_registration', {
        type: 'donor',
        name: user.name,
        email: user.email,
        phone: user.phone,
        id: user.id,
      });
    }

    if (role === 'donor') {
      if (email) {
        const { otp } = await createOTP(user.id, 'verification');
        await sendOTPEmail(email, otp, 'verification');
      }
      res.status(201).json({
        success: true,
        message: 'Registration successful. Please verify your email with the OTP sent.',
        userId: user.id,
        role,
        requiresOTP: true,
      });
    } else {
      res.status(201).json({ success: true, message: 'Registration successful.', userId: user.id });
    }
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/login ────────────────────────────────────────────────────────
async function login(req, res, next) {
  try {
    const { email, phone, password } = req.body;

    let user = null;
    if (email) {
      user = await prisma.user.findUnique({ where: { email } });
    } else if (phone) {
      user = await prisma.user.findUnique({ where: { phone } });
    }

    if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    if (user.is_blocked) return res.status(403).json({ success: false, message: 'Account is blocked. Contact admin.' });

    const valid = await comparePassword(password, user.password);
    if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials.' });

    if (user.role === 'hospital') {
      const hospital = await prisma.hospital.findUnique({ where: { user_id: user.id } });
      if (!hospital) {
        const pending = await prisma.pendingHospital.findUnique({ where: { user_id: user.id } });
        if (pending) {
          return res.status(403).json({
            success: false,
            pendingApproval: true,
            message: 'Your hospital registration is pending admin approval. Please wait for the admin to review and approve your registration.',
          });
        }
        return res.status(404).json({ success: false, message: 'Hospital profile not found.' });
      }
      if (hospital.verified_status === 'pending') {
        return res.status(403).json({
          success: false,
          pendingApproval: true,
          message: 'Your hospital registration is pending admin approval. Please wait for the admin to review and approve your registration.',
        });
      }
      if (hospital.verified_status === 'rejected') {
        return res.status(403).json({
          success: false,
          rejected: true,
          message: 'Your hospital registration was rejected by the admin. Please contact support for more information.',
        });
      }
    }

    if (!user.otp_verified) {
      if (user.email) {
        const { otp } = await createOTP(user.id, 'verification');
        await sendOTPEmail(user.email, otp, 'verification');
      }
      return res.status(200).json({
        success: false,
        requiresOTP: true,
        message: 'Account not verified. OTP sent to your email.',
        userId: user.id,
      });
    }

    const token = signToken({ id: user.id, email: user.email, role: user.role });

    let profile = null;
    if (user.role === 'donor') {
      profile = await prisma.donor.findUnique({ where: { user_id: user.id } });
    } else if (user.role === 'hospital') {
      profile = await prisma.hospital.findUnique({ where: { user_id: user.id } });
    }

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        profile,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/verify-otp ───────────────────────────────────────────────────
async function verifyOTP(req, res, next) {
  try {
    const { email, phone, otp, purpose = 'verification' } = req.body;

    let user = null;
    if (email) {
      user = await prisma.user.findUnique({ where: { email } });
    } else if (phone) {
      user = await prisma.user.findUnique({ where: { phone } });
    }
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    await validateOTP(user.id, otp, purpose);

    if (purpose === 'verification') {
      await prisma.user.update({ where: { id: user.id }, data: { otp_verified: true } });
    }

    if (user.role === 'hospital') {
      const hospital = await prisma.hospital.findUnique({ where: { user_id: user.id } });
      const pending = await prisma.pendingHospital.findUnique({ where: { user_id: user.id } });

      if (pending && !hospital) {
        const io = req.app.get('io');
        if (io) {
          io.to('admin').emit('new_registration', {
            type: 'hospital',
            name: pending.hospital_name,
            email: pending.official_email || pending.email,
            phone: pending.telephone || pending.phone,
            id: pending.id,
          });
        }

        return res.json({
          success: true,
          pendingApproval: true,
          message: 'Email verified successfully. Your hospital registration is now pending admin approval.',
        });
      }
    }

    const token = signToken({ id: user.id, email: user.email, role: user.role });

    res.json({
      success: true,
      message: purpose === 'reset' ? 'OTP verified. You may now reset your password.' : 'Email verified successfully.',
      token,
    });
  } catch (err) {
    if (err.message.includes('OTP') || err.message.includes('attempt') || err.message.includes('expired') || err.message.includes('locked')) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  }
}

// ─── POST /api/resend-otp ───────────────────────────────────────────────────
// Dedicated resend endpoint — expires old OTPs and sends a fresh one
async function resendOTP(req, res, next) {
  try {
    const { email, phone, purpose = 'verification' } = req.body;

    let user = null;
    if (email) {
      user = await prisma.user.findUnique({ where: { email } });
    } else if (phone) {
      user = await prisma.user.findUnique({ where: { phone } });
    }
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    // Force-expire any existing pending OTPs for this user+purpose
    await prisma.oTPLog.updateMany({
      where: { user_id: user.id, purpose, status: 'pending' },
      data: { status: 'expired' },
    });

    // Create brand new OTP
    const { otp } = await createOTP(user.id, purpose);
    const sendTo = email || user.email;
    if (sendTo) await sendOTPEmail(sendTo, otp, purpose);

    res.json({ success: true, message: 'New OTP sent to your email.' });
  } catch (err) {
    if (err.message.startsWith('FRAUD_DETECTED')) {
      return res.status(429).json({ success: false, message: err.message });
    }
    next(err);
  }
}

// ─── POST /api/forgot-password ──────────────────────────────────────────────
async function forgotPassword(req, res, next) {
  try {
    const { email, phone } = req.body;

    let user = null;
    if (email) {
      user = await prisma.user.findUnique({ where: { email } });
    } else if (phone) {
      user = await prisma.user.findUnique({ where: { phone } });
    }

    if (!user) {
      return res.json({ success: true, message: 'If that account exists, a reset OTP has been sent.' });
    }

    const { otp } = await createOTP(user.id, 'reset');
    if (user.email) {
      await sendOTPEmail(user.email, otp, 'reset');
    }

    res.json({ success: true, message: 'Password reset OTP sent.', userId: user.id });
  } catch (err) {
    if (err.message.startsWith('FRAUD_DETECTED')) {
      return res.status(429).json({ success: false, message: err.message });
    }
    next(err);
  }
}

// ─── POST /api/reset-password ───────────────────────────────────────────────
async function resetPassword(req, res, next) {
  try {
    const { email, phone, otp, newPassword } = req.body;

    let user = null;
    if (email) {
      user = await prisma.user.findUnique({ where: { email } });
    } else if (phone) {
      user = await prisma.user.findUnique({ where: { phone } });
    }
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    await validateOTP(user.id, otp, 'reset');

    const hashed = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });

    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    if (err.message.includes('OTP') || err.message.includes('expired') || err.message.includes('locked')) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  }
}

module.exports = { register, login, verifyOTP, resendOTP, forgotPassword, resetPassword };