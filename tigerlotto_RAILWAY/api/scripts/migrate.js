/**
 * migrate.js — Railway auto-migration on deploy
 * รันอัตโนมัติหลัง deploy: สร้าง schema + seed ข้อมูลเริ่มต้น
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mysql  = require('mysql2/promise');
const fs     = require('fs');
const path   = require('path');

async function migrate() {
  // Railway inject env as MYSQLHOST etc. — support both naming conventions
  const cfg = {
    host:     process.env.MYSQLHOST     || process.env.DB_HOST,
    port:     parseInt(process.env.MYSQLPORT || process.env.DB_PORT || 3306),
    user:     process.env.MYSQLUSER     || process.env.DB_USER,
    password: process.env.MYSQLPASSWORD || process.env.DB_PASS,
    database: process.env.MYSQLDATABASE || process.env.DB_NAME,
    multipleStatements: true,
    ssl: { rejectUnauthorized: false },
  };

  console.log('[migrate] Connecting to', cfg.host + ':' + cfg.port);
  const conn = await mysql.createConnection(cfg);
  console.log('[migrate] Connected');

  const [tables] = await conn.execute(
    "SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'users'"
  );

  if (tables[0].c === 0) {
    console.log('[migrate] Fresh database — running schema...');
    const schemaPath = path.join(__dirname, '../../tigerlotto_schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await conn.query(schema);
    console.log('[migrate] Schema created ✅');
    await seedData(conn);
  } else {
    console.log('[migrate] Database exists — running hardening patch...');
    await hardenSchema(conn);
  }

  await conn.end();
  console.log('[migrate] Complete ✅');
}

async function seedData(conn) {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}`;

  await conn.execute(`
    INSERT IGNORE INTO system_settings (\`key\`, value, group_name, description) VALUES
    ('bonus_welcome',    '50',    'wallet', 'โบนัสต้อนรับ'),
    ('min_deposit',      '100',   'wallet', 'ฝากขั้นต่ำ'),
    ('max_deposit',      '100000','wallet', 'ฝากสูงสุด'),
    ('min_withdraw',     '100',   'wallet', 'ถอนขั้นต่ำ'),
    ('max_withdraw',     '50000', 'wallet', 'ถอนสูงสุด'),
    ('cancel_window_mins','30',   'lottery','นาทีที่ยกเลิกโพยได้'),
    ('commission_l1',    '0.01',  'agent',  'Commission L1'),
    ('commission_l2',    '0.005', 'agent',  'Commission L2'),
    ('commission_l3',    '0.003', 'agent',  'Commission L3')
  `);

  await conn.execute(`
    INSERT IGNORE INTO lottery_types (code,name,icon,description,payout_config,is_active,sort_order) VALUES
    ('gov',   'หวยรัฐบาล','🇹🇭','ออกวันที่ 1 และ 16 ทุกเดือน','{}',1,1),
    ('yeekee','ยี่กี 24ชม.','⚡','90 รอบต่อวัน','{}',1,2),
    ('hanoi', 'หวยฮานอย','🌏','ออกทุกวัน 17:30','{}',1,3),
    ('laos',  'หวยลาว','🇱🇦','ออกทุกวัน 20:00','{}',1,4),
    ('set',   'หุ้น SET','📈','เช้า+บ่าย','{}',1,5)
  `);

  await conn.execute(`
    INSERT IGNORE INTO bet_types (lottery_type_id,code,name,description,digit_count,payout_rate,min_bet,max_bet,is_active) VALUES
    (1,'3_top',  '3 ตัวบน',  '3 ตัวบน',  3,900,1,5000,1),
    (1,'3_bot',  '3 ตัวท้าย','3 ตัวท้าย',3,450,1,5000,1),
    (1,'3_front','3 ตัวหน้า','3 ตัวหน้า',3,550,1,5000,1),
    (1,'3_tod',  '3 ตัวโต๊ด','3 ตัวโต๊ด',3,150,1,5000,1),
    (1,'2_top',  '2 ตัวบน',  '2 ตัวบน',  2, 96,1,5000,1),
    (1,'2_bot',  '2 ตัวล่าง','2 ตัวล่าง', 2, 96,1,5000,1),
    (1,'run_top','วิ่งบน',   'วิ่งบน',    1,  3,1,5000,1),
    (1,'run_bot','วิ่งล่าง', 'วิ่งล่าง',  1,  3,1,5000,1)
  `);

  for (const ltId of [2,3,4,5]) {
    await conn.execute(`
      INSERT IGNORE INTO bet_types (lottery_type_id,code,name,description,digit_count,payout_rate,min_bet,max_bet,is_active)
      SELECT ${ltId},code,name,description,digit_count,ROUND(payout_rate*0.85),min_bet,max_bet,is_active
      FROM bet_types WHERE lottery_type_id=1
    `);
  }

  const closeAt7 = new Date(now.getTime() + 7*24*60*60*1000).toISOString().slice(0,19).replace('T',' ');
  const closeAt3d = new Date(now.getTime() + 3*24*60*60*1000).toISOString().slice(0,19).replace('T',' ');
  const closeAt15m = new Date(now.getTime() + 15*60*1000).toISOString().slice(0,19).replace('T',' ');
  const nowStr = now.toISOString().slice(0,19).replace('T',' ');

  await conn.execute(`
    INSERT IGNORE INTO lottery_rounds (lottery_type_id,round_code,open_at,close_at,draw_at,status) VALUES
    (1,'GOV-${yyyymm}01','${nowStr}','${closeAt7}','${closeAt7}','open'),
    (2,'YEEKEE-${Date.now()}','${nowStr}','${closeAt15m}','${closeAt15m}','open'),
    (3,'HANOI-${yyyymm}','${nowStr}','${closeAt3d}','${closeAt3d}','open')
  `);

  await conn.execute(`
    INSERT IGNORE INTO promotions (code,name,description,type,value,min_deposit,max_amount,is_active,is_featured) VALUES
    ('WELCOME50','โบนัสต้อนรับ ฿50','สมัครใหม่รับโบนัส ฿50 ทันที','bonus','฿50 ฟรี',0,50,1,1),
    ('DEPOSIT10','โบนัสฝาก 10%','ฝากครั้งแรกรับโบนัส 10%','deposit','+10%',100,500,1,0)
  `);

  const bcrypt = require('bcryptjs');
  const { v4: uuidv4 } = require('uuid');
  const hash = await bcrypt.hash('Admin@1234', 12);
  const adminUuid = uuidv4();
  await conn.execute(`
    INSERT IGNORE INTO users (uuid,phone,password_hash,first_name,last_name,referral_code,role,vip_tier,is_active,is_verified,token_version)
    VALUES (?,?,?,?,?,?,'admin','diamond',1,1,0)
  `, [adminUuid, '0899999999', hash, 'Admin', 'TigerLotto', 'ADMIN001']);

  await conn.execute(`
    INSERT IGNORE INTO wallets (user_id,balance) SELECT id,0 FROM users WHERE phone='0899999999'
  `);

  console.log('[migrate] Seed complete');
  console.log('[migrate] 🔑 Admin login: 0899999999 / Admin@1234');
  console.log('[migrate] ⚠️  เปลี่ยนรหัสผ่าน Admin ทันทีหลัง login!');
}

async function hardenSchema(conn) {
  const patches = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0",
    "CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_tx_type_status ON transactions(type,status)",
    "CREATE INDEX IF NOT EXISTS idx_slips_user ON slips(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id,is_read)",
    "CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_logs(phone,created_at)",
    `INSERT IGNORE INTO system_settings (\`key\`,value,group_name,description) VALUES
     ('min_deposit','100','wallet','ฝากขั้นต่ำ'),
     ('max_deposit','100000','wallet','ฝากสูงสุด')`
  ];
  for (const sql of patches) {
    try { await conn.execute(sql); } catch(e) { /* already exists */ }
  }
}

migrate().catch(e => { console.error('[migrate] FATAL:', e.message); process.exit(1); });
