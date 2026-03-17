require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');

async function migrate() {
  const cfg = {
    host:     process.env.MYSQLHOST     || process.env.DB_HOST,
    port:     parseInt(process.env.MYSQLPORT || process.env.DB_PORT || 3306),
    user:     process.env.MYSQLUSER     || process.env.DB_USER,
    password: process.env.MYSQLPASSWORD || process.env.DB_PASS,
    database: process.env.MYSQLDATABASE || process.env.DB_NAME,
    multipleStatements: true,
    ssl: { rejectUnauthorized: false },
    connectTimeout: 20000,
  };

  console.log('[migrate] Connecting to', cfg.host + ':' + cfg.port);
  const conn = await mysql.createConnection(cfg);
  console.log('[migrate] Connected');

  const [rows] = await conn.execute(
    "SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='users'"
  );

  if (rows[0].c === 0) {
    console.log('[migrate] Fresh database — running schema...');
    const schema = fs.readFileSync(
      path.join(__dirname, '../../tigerlotto_schema.sql'), 'utf8'
    );
    await conn.query(schema);
    console.log('[migrate] Schema created');
    await seedData(conn);
  } else {
    console.log('[migrate] Database exists — running hardening patch...');
    await hardenSchema(conn);
  }

  await conn.end();
  console.log('[migrate] Complete ✅');
}

async function seedData(conn) {
  const now   = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}`;

  // system_settings — ตรง schema: key, value, type, group_name, description
  await conn.execute(`
    INSERT IGNORE INTO system_settings (\`key\`, value, type, group_name, description) VALUES
    ('bonus_welcome',    '50',    'decimal', 'promo',   'โบนัสต้อนรับ'),
    ('min_deposit',      '100',   'decimal', 'payment', 'ฝากขั้นต่ำ'),
    ('max_deposit',      '100000','decimal', 'payment', 'ฝากสูงสุด'),
    ('min_withdraw',     '100',   'decimal', 'payment', 'ถอนขั้นต่ำ'),
    ('max_withdraw',     '50000', 'decimal', 'payment', 'ถอนสูงสุด'),
    ('cancel_window_mins','30',   'integer', 'betting', 'นาทีที่ยกเลิกโพยได้'),
    ('commission_l1',    '0.01',  'decimal', 'agent',   'Commission L1'),
    ('commission_l2',    '0.005', 'decimal', 'agent',   'Commission L2'),
    ('commission_l3',    '0.003', 'decimal', 'agent',   'Commission L3'),
    ('maintenance_mode', '0',     'boolean', 'system',  'Maintenance mode'),
    ('auto_deposit',     '1',     'boolean', 'payment', 'รับฝากอัตโนมัติ')
  `);

  // lottery_types — schema: code, name, icon, rounds_per_day, sort_order
  await conn.execute(`
    INSERT IGNORE INTO lottery_types (code, name, icon, rounds_per_day, sort_order) VALUES
    ('gov',   'หวยรัฐบาล',   '🇹🇭', 2,  1),
    ('yeekee','ยี่กี 24ชม.',  '⚡',  90, 2),
    ('hanoi', 'หวยฮานอย',    '🌏',  1,  3),
    ('laos',  'หวยลาว',      '🇱🇦', 1,  4),
    ('set',   'หุ้น SET',    '📈',  2,  5)
  `);

  // bet_types — schema: lottery_type_id, code, name, digits, payout_rate, max_bet
  await conn.execute(`
    INSERT IGNORE INTO bet_types (lottery_type_id, code, name, digits, payout_rate, min_bet, max_bet) VALUES
    (1,'3_top',  '3 ตัวบน',  3, 750.00, 1, 5000),
    (1,'3_bot',  '3 ตัวล่าง',3, 450.00, 1, 5000),
    (1,'3_tod',  '3 โต๊ด',   3, 120.00, 1,10000),
    (1,'3_front','3 ตัวหน้า',3, 550.00, 1, 5000),
    (1,'2_top',  '2 ตัวบน',  2,  75.00, 1, 5000),
    (1,'2_bot',  '2 ตัวล่าง',2,  75.00, 1, 5000),
    (1,'run_top','วิ่งบน',    1,   3.20, 1,20000),
    (1,'run_bot','วิ่งล่าง',  1,   4.20, 1,20000)
  `);
  await conn.execute(`
    INSERT IGNORE INTO bet_types (lottery_type_id, code, name, digits, payout_rate, min_bet, max_bet)
    SELECT lt.id, bt.code, bt.name, bt.digits, ROUND(bt.payout_rate*0.9,2), bt.min_bet, bt.max_bet
    FROM bet_types bt, lottery_types lt
    WHERE bt.lottery_type_id=1 AND lt.code IN ('yeekee','hanoi','laos','set')
  `);

  // สร้าง round เปิดรับ
  const c7d = new Date(now.getTime()+7*864e5).toISOString().slice(0,19).replace('T',' ');
  const c3d = new Date(now.getTime()+3*864e5).toISOString().slice(0,19).replace('T',' ');
  const c15m= new Date(now.getTime()+15*6e4).toISOString().slice(0,19).replace('T',' ');
  const ns  = now.toISOString().slice(0,19).replace('T',' ');
  await conn.execute(`
    INSERT IGNORE INTO lottery_rounds (lottery_type_id, round_code, open_at, close_at, draw_at, status)
    VALUES
      (1,'GOV-${yyyymm}01','${ns}','${c7d}','${c7d}','open'),
      (2,'YEEKEE-${Date.now()}','${ns}','${c15m}','${c15m}','open'),
      (3,'HANOI-${yyyymm}','${ns}','${c3d}','${c3d}','open')
  `);

  // promotions
  await conn.execute(`
    INSERT IGNORE INTO promotions (code,name,description,type,value,min_deposit,max_amount,is_active,is_featured) VALUES
    ('WELCOME50','โบนัสต้อนรับ ฿50','สมัครใหม่รับ ฿50 ทันที','bonus','฿50',0,50,1,1)
  `);

  // Admin user
  const bcrypt = require('bcryptjs');
  const { v4: uuidv4 } = require('uuid');
  const hash = await bcrypt.hash('Admin@1234', 12);
  await conn.execute(`
    INSERT IGNORE INTO users (uuid,phone,password_hash,first_name,last_name,referral_code,role,vip_tier,is_active,is_verified,token_version)
    VALUES (?,?,?,?,?,?,'admin','diamond',1,1,0)
  `, [uuidv4(), '0899999999', hash, 'Admin', 'TigerLotto', 'ADMIN001']);
  await conn.execute(`
    INSERT IGNORE INTO wallets (user_id,balance)
    SELECT id,0 FROM users WHERE phone='0899999999'
  `);

  console.log('[migrate] Seed complete');
  console.log('[migrate] Admin: 0899999999 / Admin@1234  ← เปลี่ยนทันที!');
}

async function hardenSchema(conn) {
  const patches = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0",
    "CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_slips_user ON slips(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id,is_read)",
    `INSERT IGNORE INTO system_settings (\`key\`,value,type,group_name,description) VALUES
     ('min_deposit','100','decimal','payment','ฝากขั้นต่ำ'),
     ('max_deposit','100000','decimal','payment','ฝากสูงสุด'),
     ('bonus_welcome','50','decimal','promo','โบนัสต้อนรับ')`
  ];
  for (const sql of patches) {
    try { await conn.execute(sql); } catch {}
  }
}

migrate().catch(e => { console.error('[migrate] FATAL:', e.message); });
