/**
 * auth.js — Production-ready middleware
 * แก้ไข:
 *  1. ตรวจ token_version — reject tokens ที่ถูก invalidate (logout / password change)
 *  2. ตรวจ is_banned / is_active ทุก request (ไม่ใช่แค่ตอน login)
 *  3. adminOnly: require 2 role levels
 */

const jwt = require('jsonwebtoken');
const { queryOne } = require('../config/db');

const auth = async (req, res, next) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!token)
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'กรุณาเข้าสู่ระบบ' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Token หมดอายุ' : 'Token ไม่ถูกต้อง';
    return res.status(401).json({ error: 'UNAUTHORIZED', message: msg });
  }

  // Re-check user status on every authenticated request
  const user = await queryOne(
    'SELECT id,uuid,phone,role,is_active,is_banned,token_version FROM users WHERE id=?',
    [payload.id]
  );
  if (!user)
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'ไม่พบบัญชีผู้ใช้' });
  if (user.is_banned)
    return res.status(403).json({ error: 'BANNED', message: 'บัญชีนี้ถูกระงับ' });
  if (!user.is_active)
    return res.status(403).json({ error: 'INACTIVE', message: 'บัญชีนี้ถูกปิดใช้งาน' });

  // Verify token version matches DB — invalidates after logout or password change
  if (payload.tv !== undefined && user.token_version !== payload.tv)
    return res.status(401).json({ error: 'TOKEN_REVOKED', message: 'กรุณาเข้าสู่ระบบใหม่' });

  req.user = user;
  next();
};

const adminOnly = (req, res, next) => {
  if (!['admin', 'superadmin'].includes(req.user?.role))
    return res.status(403).json({ error: 'FORBIDDEN', message: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
  next();
};

const agentOnly = (req, res, next) => {
  if (!['agent', 'sub_agent', 'admin', 'superadmin'].includes(req.user?.role))
    return res.status(403).json({ error: 'FORBIDDEN', message: 'เฉพาะตัวแทนเท่านั้น' });
  next();
};

module.exports = { auth, adminOnly, agentOnly };
