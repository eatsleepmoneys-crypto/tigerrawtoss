const { query, queryOne, transaction } = require('../config/db');

// ── GET /agent/dashboard ──────────────────────────────────────
exports.getDashboard = async (req, res) => {
  try {
    const agent = await queryOne(
      'SELECT * FROM agents WHERE user_id=? AND is_active=1', [req.user.id]
    );
    if (!agent) return res.status(403).json({ error: 'NOT_AGENT', message: 'ไม่ใช่ตัวแทน' });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [commMonth, commTotal, memberCount, teamVolume] = await Promise.all([
      queryOne('SELECT SUM(amount) AS total FROM commissions WHERE agent_id=? AND created_at>=?', [agent.id, monthStart]),
      queryOne('SELECT SUM(amount) AS total FROM commissions WHERE agent_id=?', [agent.id]),
      queryOne('SELECT COUNT(*) AS c FROM users WHERE referred_by=?', [req.user.id]),
      queryOne('SELECT SUM(c.bet_amount) AS total FROM commissions c WHERE c.agent_id=? AND c.created_at>=?', [agent.id, monthStart]),
    ]);

    res.json({
      agent_code:            agent.agent_code,
      level:                 agent.level,
      commission_this_month: commMonth?.total || 0,
      total_commission:      commTotal?.total || 0,
      member_count:          memberCount?.c   || 0,
      team_bet_volume:       teamVolume?.total || 0,
      commission_l1:         agent.commission_l1,
      commission_l2:         agent.commission_l2,
      commission_l3:         agent.commission_l3,
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
};

// ── GET /agent/members ────────────────────────────────────────
exports.getMembers = async (req, res) => {
  try {
    const agent = await queryOne('SELECT * FROM agents WHERE user_id=?', [req.user.id]);
    if (!agent) return res.status(403).json({ error: 'NOT_AGENT' });

    const { level = 1, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Level 1 = สมาชิกที่สมัครผ่านตัวแทนโดยตรง
    const members = await query(
      `SELECT u.id, u.first_name, u.last_name, u.phone, u.vip_tier, u.created_at,
              w.balance, w.total_bet,
              COALESCE(SUM(c.amount),0) AS commission_earned
       FROM users u
       LEFT JOIN wallets w ON u.id = w.user_id
       LEFT JOIN commissions c ON c.source_user_id = u.id AND c.agent_id = ?
       WHERE u.referred_by = ?
       GROUP BY u.id
       ORDER BY w.total_bet DESC
       LIMIT ? OFFSET ?`,
      [agent.id, req.user.id, parseInt(limit), offset]
    );

    const total = await queryOne('SELECT COUNT(*) AS c FROM users WHERE referred_by=?', [req.user.id]);
    res.json({ data: members, total: total.c, page: parseInt(page), per_page: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
};

// ── GET /agent/sub-agents ─────────────────────────────────────
exports.getSubAgents = async (req, res) => {
  try {
    const agent = await queryOne('SELECT * FROM agents WHERE user_id=?', [req.user.id]);
    if (!agent) return res.status(403).json({ error: 'NOT_AGENT' });

    const subs = await query(
      `SELECT a.*, u.first_name, u.last_name, u.phone,
              COUNT(m.id) AS member_count,
              COALESCE(SUM(c.amount),0) AS commission_paid_to_you
       FROM agents a
       JOIN users u ON a.user_id = u.id
       LEFT JOIN users m ON m.referred_by = a.user_id
       LEFT JOIN commissions c ON c.agent_id = ? AND c.source_user_id IN (
         SELECT id FROM users WHERE referred_by = a.user_id
       )
       WHERE a.parent_agent_id = ?
       GROUP BY a.id`,
      [agent.id, agent.id]
    );
    res.json({ data: subs });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
};

// ── GET /agent/commissions ────────────────────────────────────
exports.getCommissions = async (req, res) => {
  try {
    const agent = await queryOne('SELECT * FROM agents WHERE user_id=?', [req.user.id]);
    if (!agent) return res.status(403).json({ error: 'NOT_AGENT' });

    const { status, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = `SELECT c.*, u.first_name, u.last_name, s.slip_no
               FROM commissions c
               JOIN users u ON c.source_user_id = u.id
               JOIN slips s ON c.slip_id = s.id
               WHERE c.agent_id = ?`;
    const params = [agent.id];
    if (status) { sql += ' AND c.status=?'; params.push(status); }
    sql += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [data, pending] = await Promise.all([
      query(sql, params),
      queryOne("SELECT SUM(amount) AS total FROM commissions WHERE agent_id=? AND status='pending'", [agent.id]),
    ]);
    res.json({ data, pending_total: pending?.total || 0 });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
};

// ── POST /agent/withdraw-commission ──────────────────────────
exports.withdrawCommission = async (req, res) => {
  try {
    const agent = await queryOne('SELECT * FROM agents WHERE user_id=?', [req.user.id]);
    if (!agent) return res.status(403).json({ error: 'NOT_AGENT' });

    const { amount, bank_account_id } = req.body;
    if (!amount || amount < 100)
      return res.status(422).json({ error: 'VALIDATION', message: 'ถอนขั้นต่ำ ฿100' });

    const wallet = await queryOne('SELECT balance FROM wallets WHERE user_id=?', [req.user.id]);
    if (parseFloat(wallet.balance) < amount)
      return res.status(422).json({ error: 'INSUFFICIENT_BALANCE', message: 'ยอดเงินไม่เพียงพอ' });

    const bank = await queryOne(
      'SELECT * FROM user_bank_accounts WHERE id=? AND user_id=?',
      [bank_account_id, req.user.id]
    );
    if (!bank) return res.status(422).json({ error: 'NO_BANK', message: 'ไม่พบบัญชีธนาคาร' });

    const ref = `COMM-WIT-${Date.now()}`;
    const txId = await transaction(async (conn) => {
      const [w] = await conn.execute('SELECT balance FROM wallets WHERE user_id=? FOR UPDATE', [req.user.id]);
      const before = parseFloat(w[0].balance);
      const after  = before - parseFloat(amount);
      await conn.execute('UPDATE wallets SET balance=?, total_withdraw=total_withdraw+? WHERE user_id=?', [after, amount, req.user.id]);
      const [tx] = await conn.execute(
        `INSERT INTO transactions (ref_no,user_id,type,amount,balance_before,balance_after,bank_account_id,status,note)
         VALUES (?,?,'withdraw',?,?,?,?,'pending','ถอน Commission')`,
        [ref, req.user.id, amount, before, after, bank.id]
      );
      return tx.insertId;
    });

    res.status(201).json({ success: true, transaction_id: txId, ref_no: ref, amount, status: 'pending' });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
};

// ── GET /agent/referral-link ──────────────────────────────────
exports.getReferralLink = async (req, res) => {
  try {
    const agent = await queryOne('SELECT * FROM agents WHERE user_id=?', [req.user.id]);
    if (!agent) return res.status(403).json({ error: 'NOT_AGENT' });

    const user = await queryOne('SELECT referral_code FROM users WHERE id=?', [req.user.id]);
    const baseUrl = process.env.APP_URL || 'https://tigerlotto.com';

    res.json({
      agent_code:    agent.agent_code,
      referral_code: user.referral_code,
      referral_url:  `${baseUrl}/register?ref=${user.referral_code}`,
      agent_url:     `${baseUrl}/register?agent=${agent.agent_code}`,
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
};
