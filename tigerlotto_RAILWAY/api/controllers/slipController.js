const { query, queryOne, transaction } = require('../config/db');

function slipNo() {
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  return `SL-${dateStr}-${String(Date.now()).substr(-6)}`;
}

// ── POST /slips — ซื้อหวย ─────────────────────────────────────
exports.createSlip = async (req, res) => {
  try {
    const { round_id, items } = req.body;
    if (!round_id || !items?.length)
      return res.status(422).json({ error: 'VALIDATION', message: 'กรุณาระบุ round_id และรายการเลข' });

    // ตรวจสอบงวด
    const round = await queryOne(
      "SELECT id, close_at, status FROM lottery_rounds WHERE id=? AND status='open'",
      [round_id]
    );
    if (!round)
      return res.status(423).json({ error: 'ROUND_CLOSED', message: 'งวดนี้ปิดรับแทงแล้วหรือไม่มีอยู่' });
    if (new Date(round.close_at) < new Date())
      return res.status(423).json({ error: 'ROUND_CLOSED', message: 'หมดเวลารับแทงแล้ว' });

    // ตรวจสอบ bet_types + คำนวณยอดรวม
    let totalAmount = 0;
    const validatedItems = [];
    for (const item of items) {
      const bt = await queryOne(
        'SELECT id, payout_rate, min_bet, max_bet, is_active FROM bet_types WHERE id=?',
        [item.bet_type_id]
      );
      if (!bt || !bt.is_active)
        return res.status(422).json({ error: 'INVALID_BET_TYPE', message: `ประเภทการแทง ${item.bet_type_id} ไม่ถูกต้อง` });
      if (item.amount < bt.min_bet || item.amount > bt.max_bet)
        return res.status(422).json({ error: 'INVALID_AMOUNT', message: `จำนวนแทง ${item.number} ต้อง ${bt.min_bet}–${bt.max_bet}` });

      totalAmount += parseFloat(item.amount);
      validatedItems.push({ ...item, payout_rate: bt.payout_rate });
    }

    const slip = await transaction(async (conn) => {
      // ตรวจยอดกระเป๋า
      const [walletRow] = await conn.execute(
        'SELECT balance FROM wallets WHERE user_id=? FOR UPDATE', [req.user.id]
      );
      const balance = parseFloat(walletRow[0].balance);
      if (balance < totalAmount)
        throw Object.assign(new Error('ยอดเงินไม่เพียงพอ'), { status: 422, code: 'INSUFFICIENT_BALANCE' });

      // หักเงิน
      const afterBalance = balance - totalAmount;
      await conn.execute(
        'UPDATE wallets SET balance=?, total_bet=total_bet+? WHERE user_id=?',
        [afterBalance, totalAmount, req.user.id]
      );

      // INSERT transaction
      const ref = `BET-${Date.now()}`;
      await conn.execute(
        `INSERT INTO transactions (ref_no,user_id,type,amount,balance_before,balance_after,status,note)
         VALUES (?,?,'bet',?,?,?,'success','ซื้อหวย')`,
        [ref, req.user.id, totalAmount, balance, afterBalance]
      );

      // INSERT slip
      const sNo = slipNo();
      const [slipRow] = await conn.execute(
        `INSERT INTO slips (slip_no,user_id,round_id,total_amount,status) VALUES (?,?,?,?,'active')`,
        [sNo, req.user.id, round_id, totalAmount]
      );
      const slipId = slipRow.insertId;

      // INSERT slip_items
      for (const item of validatedItems) {
        await conn.execute(
          'INSERT INTO slip_items (slip_id,bet_type_id,number,amount,payout_rate) VALUES (?,?,?,?,?)',
          [slipId, item.bet_type_id, item.number, item.amount, item.payout_rate]
        );
      }

      // UPDATE hot_numbers
      const round2 = await queryOne('SELECT lottery_type_id FROM lottery_rounds WHERE id=?', [round_id]);
      for (const item of validatedItems) {
        await conn.execute(
          `INSERT INTO hot_numbers (lottery_type_id,bet_type_id,round_id,number,bet_count,total_amount)
           VALUES (?,?,?,?,1,?)
           ON DUPLICATE KEY UPDATE bet_count=bet_count+1, total_amount=total_amount+?`,
          [round2.lottery_type_id, item.bet_type_id, round_id, item.number, item.amount, item.amount]
        );
      }

      // Commission to Agent
      await calcCommission(conn, req.user.id, slipId, totalAmount);

      return { slipId, sNo };
    });

    res.status(201).json({
      slip_id:      slip.slipId,
      slip_no:      slip.sNo,
      total_amount: totalAmount,
      items_count:  validatedItems.length,
      status:       'active',
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.code, message: err.message });
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
};

// ── Internal: คำนวณ Commission ─────────────────────────────────
async function calcCommission(conn, userId, slipId, amount) {
  // หา Agent ที่ดูแลสมาชิก
  const user = await queryOne('SELECT referred_by FROM users WHERE id=?', [userId]);
  if (!user?.referred_by) return;

  const rates = await Promise.all([
    queryOne("SELECT value FROM system_settings WHERE `key`='commission_l1'"),
    queryOne("SELECT value FROM system_settings WHERE `key`='commission_l2'"),
    queryOne("SELECT value FROM system_settings WHERE `key`='commission_l3'"),
  ]);
  const rateL = [parseFloat(rates[0]?.value||0.01), parseFloat(rates[1]?.value||0.005), parseFloat(rates[2]?.value||0.003)];

  let currentUserId = user.referred_by;
  for (let level = 1; level <= 3; level++) {
    const agent = await queryOne('SELECT id FROM agents WHERE user_id=? AND is_active=1', [currentUserId]);
    if (!agent) break;
    const commAmt = amount * rateL[level-1];
    await conn.execute(
      'INSERT INTO commissions (agent_id,source_user_id,slip_id,level,bet_amount,rate,amount) VALUES (?,?,?,?,?,?,?)',
      [agent.id, userId, slipId, level, amount, rateL[level-1], commAmt]
    );
    await conn.execute(
      'UPDATE wallets SET balance=balance+?, total_deposit=total_deposit+? WHERE user_id=?',
      [commAmt, commAmt, currentUserId]
    );
    await conn.execute(
      'UPDATE agents SET total_commission=total_commission+? WHERE id=?',
      [commAmt, agent.id]
    );
    // ขึ้นไป level ถัดไป
    const parentUser = await queryOne('SELECT referred_by FROM users WHERE id=?', [currentUserId]);
    if (!parentUser?.referred_by) break;
    currentUserId = parentUser.referred_by;
  }
}

// ── DELETE /slips/:id — ยกเลิกโพย ────────────────────────────
exports.cancelSlip = async (req, res) => {
  try {
    const slip = await queryOne(
      "SELECT s.*, r.close_at FROM slips s JOIN lottery_rounds r ON s.round_id=r.id WHERE s.id=? AND s.user_id=?",
      [req.params.id, req.user.id]
    );
    if (!slip) return res.status(404).json({ error: 'NOT_FOUND', message: 'ไม่พบโพยนี้' });
    if (slip.status !== 'active')
      return res.status(422).json({ error: 'CANNOT_CANCEL', message: 'ไม่สามารถยกเลิกโพยนี้ได้' });

    // ตรวจสอบเวลาปิดรับ
    const cancelWindowSetting = await queryOne("SELECT value FROM system_settings WHERE `key`='cancel_window_mins'");
    const windowMins = parseInt(cancelWindowSetting?.value || 30);
    const closeAt = new Date(slip.close_at);
    const cutoff  = new Date(closeAt.getTime() - windowMins * 60 * 1000);
    if (new Date() > cutoff)
      return res.status(423).json({ error: 'ROUND_CLOSED', message: 'หมดเวลายกเลิกโพยแล้ว' });

    await transaction(async (conn) => {
      // คืนเงิน
      const [walletRow] = await conn.execute(
        'SELECT balance FROM wallets WHERE user_id=? FOR UPDATE', [req.user.id]
      );
      const before = parseFloat(walletRow[0].balance);
      const after  = before + parseFloat(slip.total_amount);

      await conn.execute(
        'UPDATE wallets SET balance=?, total_bet=total_bet-? WHERE user_id=?',
        [after, slip.total_amount, req.user.id]
      );
      await conn.execute(
        `INSERT INTO transactions (ref_no,user_id,type,amount,balance_before,balance_after,status,note)
         VALUES (?,?,'refund',?,?,?,'success','ยกเลิกโพย #${slip.slip_no}')`,
        [`REF-${Date.now()}`, req.user.id, slip.total_amount, before, after]
      );
      await conn.execute(
        "UPDATE slips SET status='cancelled', cancelled_at=NOW() WHERE id=?",
        [slip.id]
      );

      // ย้อน Commission
      const comms = await query('SELECT * FROM commissions WHERE slip_id=? AND status="pending"', [slip.id]);
      for (const c of comms) {
        await conn.execute('UPDATE commissions SET status="cancelled" WHERE id=?', [c.id]);
        await conn.execute(
          'UPDATE wallets SET balance=balance-? WHERE user_id=(SELECT user_id FROM agents WHERE id=?)',
          [c.amount, c.agent_id]
        );
      }
    });

    res.json({ success: true, refund_amount: slip.total_amount });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.code, message: err.message });
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
};

// ── GET /slips ────────────────────────────────────────────────
exports.getSlips = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let sql = `
      SELECT s.*, r.round_code, r.close_at, r.status AS round_status,
             lt.name AS lottery_name, lt.icon
      FROM slips s
      JOIN lottery_rounds r ON s.round_id = r.id
      JOIN lottery_types lt ON r.lottery_type_id = lt.id
      WHERE s.user_id=?`;
    const params = [req.user.id];
    if (status) { sql += ' AND s.status=?'; params.push(status); }
    sql += ' ORDER BY s.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const slips = await query(sql, params);

    // Attach items
    for (const slip of slips) {
      slip.items = await query(
        `SELECT si.*, bt.name AS bet_type_name, bt.code AS bet_type_code
         FROM slip_items si JOIN bet_types bt ON si.bet_type_id=bt.id
         WHERE si.slip_id=?`,
        [slip.id]
      );
    }

    const [total] = await query('SELECT COUNT(*) AS c FROM slips WHERE user_id=?', [req.user.id]);
    res.json({ data: slips, total: total.c, page: parseInt(page), per_page: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
};

// ── GET /slips/:id ────────────────────────────────────────────
exports.getSlip = async (req, res) => {
  try {
    const slip = await queryOne(
      `SELECT s.*, r.round_code, r.close_at, r.status AS round_status, lt.name AS lottery_name
       FROM slips s JOIN lottery_rounds r ON s.round_id=r.id JOIN lottery_types lt ON r.lottery_type_id=lt.id
       WHERE s.id=? AND s.user_id=?`,
      [req.params.id, req.user.id]
    );
    if (!slip) return res.status(404).json({ error: 'NOT_FOUND' });
    slip.items = await query(
      'SELECT si.*, bt.name, bt.code FROM slip_items si JOIN bet_types bt ON si.bet_type_id=bt.id WHERE si.slip_id=?',
      [slip.id]
    );
    res.json(slip);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
};
