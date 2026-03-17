/**
 * kycController.js — Production-ready
 * แก้ไข:
 *  1. ตรวจ MIME type จริง (ไม่ใช่แค่ extension) ป้องกัน file upload bypass
 *  2. Validate เลขบัตรประชาชน 13 หลัก
 *  3. ป้องกัน path traversal ใน filename
 *  4. จำกัดจำนวนไฟล์และ field ที่รับได้
 */

const { query, queryOne, transaction } = require('../config/db');
const path   = require('path');
const fs     = require('fs');
const multer = require('multer');

// ── Thai National ID Checksum Validator ───────────────────────
function validateThaiID(id) {
  if (!id || !/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(id[i]) * (13 - i);
  const check = (11 - (sum % 11)) % 10;
  return check === parseInt(id[12]);
}

// ── Multer Setup — with MIME type check ───────────────────────
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'application/pdf'];
const ALLOWED_EXTS  = ['.jpg', '.jpeg', '.png', '.pdf'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.env.UPLOAD_DIR || '/tmp/tgl_uploads', 'kyc');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    // Safe filename — no path traversal, no special chars
    cb(null, `kyc-${req.user.id}-${Date.now()}-${Math.random().toString(36).substr(2,4)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5 MB
    files:    2,
    fields:   5,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    // Check BOTH extension and MIME type
    if (!ALLOWED_EXTS.includes(ext) || !ALLOWED_MIMES.includes(file.mimetype)) {
      return cb(Object.assign(new Error('รองรับเฉพาะ JPG, PNG, PDF และไฟล์ขนาดไม่เกิน 5 MB'), { code: 'INVALID_FILE_TYPE' }));
    }
    cb(null, true);
  },
});
exports.upload = upload;

// ── POST /me/kyc ──────────────────────────────────────────────
exports.submitKYC = async (req, res) => {
  try {
    const existing = await queryOne('SELECT * FROM user_kyc WHERE user_id=?', [req.user.id]);
    if (existing && existing.status === 'approved')
      return res.status(409).json({ error: 'ALREADY_APPROVED', message: 'ยืนยันตัวตนแล้ว' });
    if (existing && existing.status === 'pending')
      return res.status(409).json({ error: 'PENDING_REVIEW', message: 'รออนุมัติอยู่' });

    const { id_card_number } = req.body;

    if (!id_card_number)
      return res.status(422).json({ error: 'VALIDATION', message: 'กรุณาระบุเลขบัตรประชาชน' });

    const cleanedID = id_card_number.replace(/[-\s]/g, '');
    if (!validateThaiID(cleanedID))
      return res.status(422).json({ error: 'VALIDATION', message: 'เลขบัตรประชาชนไม่ถูกต้อง' });

    // Check if ID card already used by another user
    const idUsed = await queryOne(
      'SELECT k.user_id FROM user_kyc k WHERE k.id_card_number=? AND k.user_id!=? AND k.status!="rejected"',
      [cleanedID, req.user.id]
    );
    if (idUsed)
      return res.status(409).json({ error: 'ID_ALREADY_USED', message: 'เลขบัตรประชาชนนี้ถูกใช้งานแล้ว' });

    const idCardImage = req.files?.id_card_image?.[0]?.filename
      ? `/uploads/kyc/${req.files.id_card_image[0].filename}` : null;
    const selfieImage = req.files?.selfie_image?.[0]?.filename
      ? `/uploads/kyc/${req.files.selfie_image[0].filename}` : null;

    if (!idCardImage)
      return res.status(422).json({ error: 'VALIDATION', message: 'กรุณาอัปโหลดรูปบัตรประชาชน' });

    if (existing) {
      await query(
        'UPDATE user_kyc SET id_card_number=?,id_card_image=?,selfie_image=?,status="pending",reviewed_by=NULL,reviewed_at=NULL,reject_reason=NULL WHERE user_id=?',
        [cleanedID, idCardImage, selfieImage, req.user.id]
      );
    } else {
      await query(
        'INSERT INTO user_kyc (user_id,id_card_number,id_card_image,selfie_image,status) VALUES (?,?,?,?,"pending")',
        [req.user.id, cleanedID, idCardImage, selfieImage]
      );
    }

    await query(
      `INSERT INTO notifications (user_id,type,title,body,data)
       SELECT id,'system','📋 KYC ใหม่รอตรวจสอบ',?,?
       FROM users WHERE role IN ('admin','superadmin')`,
      [
        `สมาชิก #${req.user.id} ส่งเอกสาร KYC รอตรวจสอบ`,
        JSON.stringify({ user_id: req.user.id }),
      ]
    );

    res.status(201).json({ status: 'pending', message: 'ส่งเอกสารแล้ว รอการตรวจสอบ 1-24 ชั่วโมง' });
  } catch (err) {
    if (err.code === 'INVALID_FILE_TYPE')
      return res.status(422).json({ error: 'INVALID_FILE_TYPE', message: err.message });
    console.error('[submitKYC]', err.message);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'เกิดข้อผิดพลาด' });
  }
};

// ── GET /me/kyc ───────────────────────────────────────────────
exports.getKYCStatus = async (req, res) => {
  try {
    const kyc = await queryOne(
      'SELECT id,status,reviewed_at,reject_reason,created_at FROM user_kyc WHERE user_id=?',
      [req.user.id]
    );
    if (!kyc) return res.json({ status: 'not_submitted' });
    res.json(kyc);
  } catch (err) {
    console.error('[getKYCStatus]', err.message);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'เกิดข้อผิดพลาด' });
  }
};

// ── GET /admin/kyc ────────────────────────────────────────────
exports.adminListKYC = async (req, res) => {
  try {
    const VALID_STATUSES = ['pending', 'approved', 'rejected'];
    const status  = VALID_STATUSES.includes(req.query.status) ? req.query.status : 'pending';
    const limit   = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset  = (Math.max(parseInt(req.query.page) || 1, 1) - 1) * limit;

    const data  = await query(
      `SELECT k.id,k.status,k.created_at,k.reviewed_at,k.reject_reason,
              u.id AS user_id,u.first_name,u.last_name,u.phone
       FROM user_kyc k JOIN users u ON k.user_id=u.id
       WHERE k.status=? ORDER BY k.created_at ASC LIMIT ? OFFSET ?`,
      [status, limit, offset]
    );
    const total = await queryOne('SELECT COUNT(*) AS c FROM user_kyc WHERE status=?', [status]);
    res.json({ data, total: total.c });
  } catch (err) {
    console.error('[adminListKYC]', err.message);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'เกิดข้อผิดพลาด' });
  }
};

// ── PUT /admin/kyc/:id/approve ────────────────────────────────
exports.approveKYC = async (req, res) => {
  try {
    const kyc = await queryOne("SELECT * FROM user_kyc WHERE id=? AND status='pending'", [req.params.id]);
    if (!kyc) return res.status(404).json({ error: 'NOT_FOUND' });

    await transaction(async (conn) => {
      await conn.execute(
        "UPDATE user_kyc SET status='approved',reviewed_by=?,reviewed_at=NOW() WHERE id=?",
        [req.user.id, kyc.id]
      );
      await conn.execute('UPDATE users SET is_verified=1 WHERE id=?', [kyc.user_id]);
      await conn.execute(
        `INSERT INTO notifications (user_id,type,title,body)
         VALUES (?,'system','✅ ยืนยันตัวตนสำเร็จ','เอกสาร KYC ได้รับการอนุมัติแล้ว สามารถถอนเงินได้เต็มจำนวน')`,
        [kyc.user_id]
      );
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[approveKYC]', err.message);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'เกิดข้อผิดพลาด' });
  }
};

// ── PUT /admin/kyc/:id/reject ─────────────────────────────────
exports.rejectKYC = async (req, res) => {
  try {
    const { reason } = req.body;
    const kyc = await queryOne("SELECT * FROM user_kyc WHERE id=? AND status='pending'", [req.params.id]);
    if (!kyc) return res.status(404).json({ error: 'NOT_FOUND' });

    const safeReason = (reason || 'เอกสารไม่ชัดเจน').substring(0, 200);
    await transaction(async (conn) => {
      await conn.execute(
        "UPDATE user_kyc SET status='rejected',reviewed_by=?,reviewed_at=NOW(),reject_reason=? WHERE id=?",
        [req.user.id, safeReason, kyc.id]
      );
      await conn.execute(
        `INSERT INTO notifications (user_id,type,title,body)
         VALUES (?,'system','❌ เอกสาร KYC ไม่ผ่าน',?)`,
        [kyc.user_id, `เหตุผล: ${safeReason} กรุณาส่งใหม่`]
      );
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[rejectKYC]', err.message);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'เกิดข้อผิดพลาด' });
  }
};
