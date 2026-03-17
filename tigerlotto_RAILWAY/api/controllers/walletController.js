/**
 * walletController.js — Production-ready
 * แก้ไข:
 *  1. ลบ QR auto-approve — deposit ทุกวิธีต้องรอ Admin อนุมัติ
 *  2. เพิ่ม max limit cap สำหรับ getTransactions
 *  3. เพิ่ม deposit minimum validation จาก system_settings
 *  4. ป้องกัน duplicate pending deposit (ส่งซ้ำหลายครั้ง)
 *  5. Sanitize payment_method ด้วย whitelist
 */

const { query, queryOne, transaction } = require('../config/db');

const ALLOWED_PAYMENT_METHODS = ['qr_promptpay', 'bank_transfer', 'truemoney'];

function refNo(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
}

// ── GET /wallet ───────────────────────────────────────────────
exports.getWallet = async (req, res) => {
  try {
    const wallet = await queryOne(
      'SELECT id,user_id,balance,bonus_balance,locked_balance,total_deposit,total_withdraw,total_bet,total_won FROM wallets WHERE user_id=?',
      [req.user.id]
    );
    if (!wallet) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(wallet);
  } catch (err) {
    console.error('[getWallet]', err.message);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'เกิดข้อผิดพลาด' });
  }
};

// ── POST /wallet/deposit ──────────────────────────────────────
exports.deposit = async (req, res) => {
  try {
    const { amount, payment_method, slip_image } = req.body;

    // Validate amount
    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0)
      return res.status(422).json({ error: 'VALIDATION', message: 'จำนวนเงินไม่ถูกต้อง' });

    // Validate payment_method via whitelist
    const method = ALLOWED_PAYMENT_METHODS.includes(payment_method) ? payment_method : 'bank_transfer';

    // Min/Max from settings
    const [minSetting, maxSetting] = await Promise.all([
      queryOne("SELECT value FROM system_settings WHERE `key`='min_deposit'"),
      queryOne("SELECT value FROM system_settings WHERE `key`='max_deposit'"),
    ]);
    const minD = parseFloat(minSetting?.value || 100);
    const maxD = parseFloat(maxSetting?.value || 100000);
    if (amountNum < minD)
      return res.status(422).json({ error: 'MIN_DEPOSIT', message: `ฝากขั้นต่ำ ฿${minD}` });
    if (amountNum > maxD)
      return res.status(422).json({ error: 'MAX_DEPOSIT', message: `ฝากสูงสุด ฿${maxD}` });

    // Check for duplicate pending deposit (same amount within 5 minutes)
    const dupCheck = await queryOne(
      "SELECT id FROM transactions WHERE user_id=? AND type='deposit' AND status='pending' AND amount=? AND created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)",
      [req.user.id, amountNum]
    );
    if (dupCheck)
      return res.status(409).json({ error: 'DUPLICATE_REQUEST', message: 'มีคำขอฝากเงินจำนวนนี้รออยู่แล้ว' });

    const wallet = await queryOne('SELECT balance FROM wallets WHERE user_id=?', [req.user.id]);
    const ref    = refNo('DEP');

    const txId = await transaction(async (conn) => {
      const [tx] = await conn.execute(
        `INSERT INTO transactions (ref_no,user_id,type,amount,balance_before,balance_after,payment_method,slip_image,status,note)
         VALUES (?,?,'deposit',?,?,?,?,?,'pending','ฝากเงิน รอตรวจสอบ')`,
        [ref, req.user.id, amountNum, wallet.balance, wallet.balance, method, slip_image || null]
      );
      return tx.insertId;
    });

    // NOTE: ไม่มี auto-approve อีกต่อไป — Admin ต้องอนุมัติทุกรายการที่ /admin/transactions/:id/approve
    // Webhook จากธนาคารควร call approveDeposit() เมื่อยืนยันการรับเงินแล้ว

    res.status(201).json({
      transaction_id: txId,
      ref_no:         ref,
      status:         'pending',
      amount:         amountNum,
      message:        'รับคำขอแล้ว กรุณารอการตรวจสอบ 5-15 นาที',
    });
  } catch (err) {
    console.error('[deposit]', err.message);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'เกิดข้อผิดพลาด' });
  }
};

// Internal: อนุมัติฝากเงิน (เรียกจาก Admin หรือ Payment Webhook เท่านั้น)
async function approveDeposit(txId, userId, amount) {
  await transaction(async (conn) => {
    // Re-check transaction status to prevent double-approval
    const [txRow] = await conn.execute(
      "SELECT status FROM transactions WHERE id=? FOR UPDATE",
      [txId]
    );
    if (!txRow.length || txRow[0].status !== 'pending')
      throw Object.assign(new Error('Transaction already processed'), { status: 409, code: 'ALREADY_PROCESSED' });

    const [wallet] = await conn.execute('SELECT balance FROM wallets WHERE user_id=? FOR UPDATE', [userId]);
    const before   = parseFloat(wallet[0].balance);
    const after    = before + parseFloat(amount);

    await conn.execute(
      'UPDATE wallets SET balance=?,total_deposit=total_deposit+? WHERE user_id=?',
      [after, amount, userId]
    );
    await conn.execute(
      'UPDATE transactions SET status=?,balance_before=?,balance_after=?,processed_at=NOW() WHERE id=?',
      ['success', before, after, txId]
    );
  });
}
exports.approveDeposit = approveDeposit;

// ── POST /wallet/withdraw ─────────────────────────────────────
exports.withdraw = async (req, res) => {
  try {
    const { amount, bank_account_id } = req.body;
    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0)
      return res.status(422).json({ error: 'VALIDATION', message: 'จำนวนเงินไม่ถูกต้อง' });

    const [minSetting, maxSetting] = await Promise.all([
      queryOne("SELECT value FROM system_settings WHERE `key`='min_withdraw'"),
      queryOne("SELECT value FROM system_settings WHERE `key`='max_withdraw'"),
    ]);
    const minW = parseFloat(minSetting?.value || 100);
    const maxW = parseFloat(maxSetting?.value || 50000);
    if (amountNum < minW) return res.status(422).json({ error: 'MIN_WITHDRAWAL', message: `ถอนขั้นต่ำ ฿${minW}` });
    if (amountNum > maxW) return res.status(422).json({ error: 'MAX_WITHDRAWAL', message: `ถอนสูงสุด ฿${maxW}` });

    const bank = bank_account_id
      ? await queryOne('SELECT * FROM user_bank_accounts WHERE id=? AND user_id=?', [bank_account_id, req.user.id])
      : await queryOne('SELECT * FROM user_bank_accounts WHERE user_id=? AND is_default=1', [req.user.id]);
    if (!bank) return res.status(422).json({ error: 'NO_BANK', message: 'ไม่พบบัญชีธนาคาร กรุณาเพิ่มบัญชีก่อน' });

    const ref = refNo('WIT');
    const txId = await transaction(async (conn) => {
      const [walletRow] = await conn.execute(
        'SELECT balance FROM wallets WHERE user_id=? FOR UPDATE', [req.user.id]
      );
      const balance = parseFloat(walletRow[0].balance);
      if (balance < amountNum)
        throw Object.assign(new Error('ยอดเงินไม่เพียงพอ'), { status: 422, code: 'INSUFFICIENT_BALANCE' });

      const after = balance - amountNum;
      await conn.execute(
        'UPDATE wallets SET balance=?,locked_balance=locked_balance+?,total_withdraw=total_withdraw+? WHERE user_id=?',
        [after, amountNum, amountNum, req.user.id]
      );
      const [tx] = await conn.execute(
        `INSERT INTO transactions (ref_no,user_id,type,amount,balance_before,balance_after,bank_account_id,status,note)
         VALUES (?,?,'withdraw',?,?,?,?,'pending','ถอนเงิน')`,
        [ref, req.user.id, amountNum, balance, after, bank.id]
      );
      return tx.insertId;
    });

    res.status(201).json({
      transaction_id: txId,
      ref_no:         ref,
      status:         'pending',
      amount:         amountNum,
      estimated_time: '5-15 นาที',
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.code, message: err.message });
    console.error('[withdraw]', err.message);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'เกิดข้อผิดพลาด' });
  }
};

// ── GET /wallet/transactions ──────────────────────────────────
exports.getTransactions = async (req, res) => {
  try {
    const { type, status, page = 1 } = req.query;

    // Cap limit to prevent abuse
    const limit  = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const offset = (Math.max(parseInt(page), 1) - 1) * limit;

    // Whitelist type and status to prevent SQL injection via enum bypass
    const VALID_TYPES   = ['deposit', 'withdraw', 'bet', 'win', 'bonus', 'refund'];
    const VALID_STATUSES = ['pending', 'success', 'failed', 'cancelled'];

    let sql    = 'SELECT id,ref_no,type,amount,balance_before,balance_after,payment_method,status,note,created_at FROM transactions WHERE user_id=?';
    let params = [req.user.id];

    if (type   && VALID_TYPES.includes(type))     { sql += ' AND type=?';   params.push(type); }
    if (status && VALID_STATUSES.includes(status)) { sql += ' AND status=?'; params.push(status); }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [data, countRow] = await Promise.all([
      query(sql, params),
      queryOne('SELECT COUNT(*) AS total FROM transactions WHERE user_id=?', [req.user.id]),
    ]);

    res.json({ data, total: countRow.total, page: parseInt(page), per_page: limit });
  } catch (err) {
    console.error('[getTransactions]', err.message);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'เกิดข้อผิดพลาด' });
  }
};
