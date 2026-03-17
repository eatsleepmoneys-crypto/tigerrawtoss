/**
 * authController.js — Production-ready
 * แก้ไข:
 *  1. ลบ console.log OTP
 *  2. เพิ่ม Thai phone validation
 *  3. เพิ่ม token_version (invalidate tokens เมื่อเปลี่ยน password / logout)
 *  4. เพิ่ม Refresh Token support
 *  5. OTP rate-limit ต่อเบอร์ (ป้องกัน OTP spam)
 *  6. Logout endpoint invalidate token
 */

const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query, queryOne, transaction } = require('../config/db');

// ── Validators ────────────────────────────────────────────────
const THAI_PHONE_RE = /^0[6-9]\d{8}$/;

function validatePhone(phone) {
  const cleaned = (phone || '').replace(/[-\s]/g, '');
  return THAI_PHONE_RE.test(cleaned) ? cleaned : null;
}

function validatePassword(pw) {
  if (!pw || pw.length < 8) return 'รหัสผ่านต้องมีอย่างน้อย 8 ตัว';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw))
    return 'รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข';
  return null;
}

// ── Token helpers ─────────────────────────────────────────────
function signAccessToken(user) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET not set');
  return jwt.sign(
    { id: user.id, uuid: user.uuid, role: user.role, phone: user.phone, tv: user.token_version || 0 },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '2h' }
  );
}

function signRefreshToken(user) {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT secret not set');
  return jwt.sign(
    { id: user.id, tv: user.token_version || 0, type: 'refresh' },
    secret,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );
}

function genRefCode() {
  return 'TGL-' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

// ── POST /auth/register ───────────────────────────────────────
exports.register = async (req, res) => {
  try {
    const { phone: rawPhone, password, first_name, last_name, referral_code } = req.body;

    if (!rawPhone || !password || !first_name || !last_name)
      return res.status(422).json({ error: 'VALIDATION', message: 'กรุณากรอกข้อมูลให้ครบ' });

    const phone = validatePhone(rawPhone);
    if (!phone)
      return res.status(422).json({ error: 'VALIDATION', message: 'เบอร์โทรศัพท์ไม่ถูกต้อง (ต้องเป็นเบอร์มือถือไทย 06x-09x)' });

    const pwErr = validatePassword(password);
    if (pwErr) return res.status(422).json({ error: 'VALIDATION', message: pwErr });

    const fname = first_name.trim().substring(0, 50);
    const lname = last_name.trim().substring(0, 50);
    if (!fname || !lname)
      return res.status(422).json({ error: 'VALIDATION', message: 'ชื่อ-นามสกุลไม่ถูกต้อง' });

    const exists = await queryOne('SELECT id FROM users WHERE phone=?', [phone]);
    if (exists)
      return res.status(409).json({ error: 'DUPLICATE_PHONE', message: 'เบอร์โทรนี้ถูกใช้งานแล้ว' });

    let referredBy = null;
    if (referral_code) {
      const ref = await queryOne('SELECT id FROM users WHERE referral_code=?', [referral_code.toUpperCase()]);
      if (ref) referredBy = ref.id;
    }

    const hash      = await bcrypt.hash(password, 12);
    const uuid      = uuidv4();
    const myRefCode = genRefCode();

    const result = await transaction(async (conn) => {
      const [userRow] = await conn.execute(
        `INSERT INTO users (uuid,phone,password_hash,first_name,last_name,referral_code,referred_by,role,vip_tier,token_version)
         VALUES (?,?,?,?,?,?,?,'member','bronze',0)`,
        [uuid, phone, hash, fname, lname, myRefCode, referredBy]
      );
      const userId = userRow.insertId;
      await conn.execute('INSERT INTO wallets (user_id,balance) VALUES (?,0)', [userId]);

      const bonusSetting = await queryOne("SELECT value FROM system_settings WHERE `key`='bonus_welcome'");
      const bonusAmt = parseFloat(bonusSetting?.value || 0);
      if (bonusAmt > 0) {
        await conn.execute(
          'UPDATE wallets SET balance=balance+?,bonus_balance=bonus_balance+?,total_deposit=total_deposit+? WHERE user_id=?',
          [bonusAmt, bonusAmt, bonusAmt, userId]
        );
        await conn.execute(
          `INSERT INTO transactions (ref_no,user_id,type,amount,balance_before,balance_after,status,note)
           VALUES (?,?,'bonus',?,0,?,'success','โบนัสต้อนรับสมาชิกใหม่')`,
          [`BONUS-${Date.now()}`, userId, bonusAmt, bonusAmt]
        );
      }
      return userId;
    });

    const user         = await queryOne(
      'SELECT id,uuid,phone,first_name,last_name,role,vip_tier,referral_code,token_version FROM users WHERE id=?',
      [result]
    );
    const accessToken  = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    res.status(201).json({ token: accessToken, refresh_token: refreshToken, user });
  } catch (err) {
    console.error('[register]', err.message);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่' });
  }
};

// ── POST /auth/login ──────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { phone: rawPhone, password } = req.body;
    if (!rawPhone || !password)
      return res.status(422).json({ error: 'VALIDATION', message: 'กรุณากรอกเบอร์และรหัสผ่าน' });

    const phone = validatePhone(rawPhone);
    if (!phone)
      return res.status(422).json({ error: 'VALIDATION', message: 'เบอร์โทรศัพท์ไม่ถูกต้อง' });

    const user = await queryOne(
      'SELECT id,uuid,phone,password_hash,first_name,last_name,role,vip_tier,is_active,is_banned,referral_code,token_version FROM users WHERE phone=?',
      [phone]
    );

    // Constant-time compare to prevent user enumeration via timing
    if (!user) {
      await bcrypt.compare(password, '$2a$12$dummyhashfortimingnormalization000000000000000000000');
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'เบอร์โทรหรือรหัสผ่านไม่ถูกต้อง' });
    }
    if (user.is_banned)
      return res.status(403).json({ error: 'BANNED', message: 'บัญชีนี้ถูกระงับการใช้งาน' });
    if (!user.is_active)
      return res.status(403).json({ error: 'INACTIVE', message: 'บัญชีนี้ไม่ได้ใช้งาน' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'เบอร์โทรหรือรหัสผ่านไม่ถูกต้อง' });

    await query('UPDATE users SET last_login_at=NOW() WHERE id=?', [user.id]);

    const accessToken  = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    const { password_hash, ...safeUser } = user;

    res.json({ token: accessToken, refresh_token: refreshToken, user: safeUser });
  } catch (err) {
    console.error('[login]', err.message);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่' });
  }
};

// ── POST /auth/refresh ────────────────────────────────────────
exports.refreshToken = async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token)
      return res.status(422).json({ error: 'VALIDATION', message: 'กรุณาส่ง refresh_token' });

    const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    let payload;
    try {
      payload = jwt.verify(refresh_token, secret);
    } catch {
      return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Token หมดอายุหรือไม่ถูกต้อง' });
    }

    if (payload.type !== 'refresh')
      return res.status(401).json({ error: 'INVALID_TOKEN', message: 'ประเภท token ไม่ถูกต้อง' });

    const user = await queryOne(
      'SELECT id,uuid,phone,role,vip_tier,token_version,is_active,is_banned FROM users WHERE id=?',
      [payload.id]
    );
    if (!user || user.is_banned || !user.is_active)
      return res.status(401).json({ error: 'UNAUTHORIZED' });

    if (user.token_version !== payload.tv)
      return res.status(401).json({ error: 'TOKEN_REVOKED', message: 'กรุณาเข้าสู่ระบบใหม่' });

    res.json({ token: signAccessToken(user) });
  } catch (err) {
    console.error('[refreshToken]', err.message);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'เกิดข้อผิดพลาด' });
  }
};

// ── POST /auth/logout ─────────────────────────────────────────
exports.logout = async (req, res) => {
  try {
    await query('UPDATE users SET token_version=token_version+1 WHERE id=?', [req.user.id]);
    res.json({ success: true, message: 'ออกจากระบบแล้ว' });
  } catch (err) {
    console.error('[logout]', err.message);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'เกิดข้อผิดพลาด' });
  }
};

// ── POST /auth/otp/send ───────────────────────────────────────
exports.sendOTP = async (req, res) => {
  try {
    const { phone: rawPhone, purpose } = req.body;
    if (!rawPhone)
      return res.status(422).json({ error: 'VALIDATION', message: 'กรุณากรอกเบอร์โทร' });

    const phone = validatePhone(rawPhone);
    if (!phone)
      return res.status(422).json({ error: 'VALIDATION', message: 'เบอร์โทรศัพท์ไม่ถูกต้อง' });

    // Rate-limit: max 5 OTPs per phone per 10 minutes
    const recentCount = await queryOne(
      "SELECT COUNT(*) AS c FROM otp_logs WHERE phone=? AND created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)",
      [phone]
    );
    if (recentCount.c >= 5)
      return res.status(429).json({ error: 'OTP_RATE_LIMIT', message: 'ส่ง OTP บ่อยเกินไป กรุณารอ 10 นาที' });

    const otp       = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min

    const user = await queryOne('SELECT id FROM users WHERE phone=?', [phone]);
    await query(
      'INSERT INTO otp_logs (user_id,phone,otp_code,purpose,expires_at,ip_address) VALUES (?,?,?,?,?,?)',
      [user?.id || null, phone, otp, purpose || 'login', expiresAt, req.ip]
    );

    // ── Send SMS via Infobip ───────────────────────────────────
    if (process.env.INFOBIP_API_KEY && process.env.INFOBIP_BASE_URL) {
      const axios = require('axios');
      try {
        await axios.post(
          `${process.env.INFOBIP_BASE_URL}/sms/2/text/advanced`,
          {
            messages: [{
              from:         process.env.INFOBIP_SENDER || 'TigerLotto',
              destinations: [{ to: `+66${phone.substring(1)}` }],
              text:         `[TigerLotto] รหัส OTP: ${otp} หมดอายุใน 5 นาที ห้ามบอกใคร`,
            }],
          },
          {
            headers: {
              Authorization: `App ${process.env.INFOBIP_API_KEY}`,
              'Content-Type': 'application/json',
            },
            timeout: 5000,
          }
        );
      } catch (smsErr) {
        console.error('[SMS]', smsErr.message);
        // Log error but don't expose to client — OTP is saved, admin can check logs
      }
    } else if (process.env.NODE_ENV !== 'production') {
      // DEV ONLY — ไม่แสดง OTP ใน production logs เด็ดขาด
      console.log(`[OTP DEV ONLY] ${phone} → ${otp}`);
    } else {
      // Production without SMS keys configured — fail loudly for admin awareness
      console.error('[OTP] INFOBIP not configured — OTP not sent to user');
    }

    res.json({ message: 'ส่ง OTP แล้ว', expires_in: 300 });
  } catch (err) {
    console.error('[sendOTP]', err.message);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'เกิดข้อผิดพลาด' });
  }
};

// ── POST /auth/otp/verify ─────────────────────────────────────
exports.verifyOTP = async (req, res) => {
  try {
    const { phone: rawPhone, otp_code, purpose } = req.body;
    const phone = validatePhone(rawPhone);
    if (!phone || !otp_code)
      return res.status(422).json({ error: 'VALIDATION', message: 'ข้อมูลไม่ครบ' });

    const log = await queryOne(
      'SELECT * FROM otp_logs WHERE phone=? AND otp_code=? AND purpose=? AND is_used=0 AND expires_at>NOW() ORDER BY id DESC LIMIT 1',
      [phone, otp_code, purpose || 'login']
    );
    if (!log)
      return res.status(422).json({ error: 'INVALID_OTP', message: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' });

    await query('UPDATE otp_logs SET is_used=1, used_at=NOW() WHERE id=?', [log.id]);
    res.json({ verified: true });
  } catch (err) {
    console.error('[verifyOTP]', err.message);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'เกิดข้อผิดพลาด' });
  }
};
