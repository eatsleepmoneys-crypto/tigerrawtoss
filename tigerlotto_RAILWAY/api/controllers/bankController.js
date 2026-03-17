const { query, queryOne } = require('../config/db');

exports.list = async (req, res) => {
  const banks = await query(
    'SELECT * FROM user_bank_accounts WHERE user_id=? ORDER BY is_default DESC, created_at DESC',
    [req.user.id]
  );
  res.json({ banks });
};

exports.add = async (req, res) => {
  const { bank_code, bank_name, account_number, account_name } = req.body;
  if (!bank_code || !account_number || !account_name)
    return res.status(422).json({ error: 'VALIDATION', message: 'กรุณากรอกข้อมูลให้ครบ' });

  const exists = await queryOne(
    'SELECT id FROM user_bank_accounts WHERE user_id=? AND account_number=?',
    [req.user.id, account_number]
  );
  if (exists) return res.status(409).json({ error: 'DUPLICATE', message: 'บัญชีนี้มีอยู่แล้ว' });

  const count = await queryOne('SELECT COUNT(*) AS c FROM user_bank_accounts WHERE user_id=?', [req.user.id]);
  const isDefault = count.c === 0 ? 1 : 0;

  const [row] = await query(
    'INSERT INTO user_bank_accounts (user_id,bank_code,bank_name,account_number,account_name,is_default) VALUES (?,?,?,?,?,?)',
    [req.user.id, bank_code, bank_name || bank_code, account_number, account_name, isDefault]
  );
  res.status(201).json({ success: true, id: row.insertId });
};

exports.setDefault = async (req, res) => {
  const bank = await queryOne('SELECT * FROM user_bank_accounts WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
  if (!bank) return res.status(404).json({ error: 'NOT_FOUND' });
  await query('UPDATE user_bank_accounts SET is_default=0 WHERE user_id=?', [req.user.id]);
  await query('UPDATE user_bank_accounts SET is_default=1 WHERE id=?', [req.params.id]);
  res.json({ success: true });
};

exports.remove = async (req, res) => {
  const bank = await queryOne('SELECT * FROM user_bank_accounts WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
  if (!bank) return res.status(404).json({ error: 'NOT_FOUND' });
  if (bank.is_default) return res.status(422).json({ error: 'DEFAULT_BANK', message: 'ไม่สามารถลบบัญชีหลักได้' });
  await query('DELETE FROM user_bank_accounts WHERE id=?', [req.params.id]);
  res.json({ success: true });
};
