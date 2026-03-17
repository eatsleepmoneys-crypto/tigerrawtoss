/**
 * TigerLotto — Railway-optimized Server
 * รองรับ Railway env vars: MYSQLHOST, MYSQLPORT, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE, PORT
 */
require('dotenv').config();

// ── Map Railway MySQL env → app env ──────────────────────────
if (process.env.MYSQLHOST && !process.env.DB_HOST) {
  process.env.DB_HOST = process.env.MYSQLHOST;
  process.env.DB_PORT = process.env.MYSQLPORT || '3306';
  process.env.DB_USER = process.env.MYSQLUSER;
  process.env.DB_PASS = process.env.MYSQLPASSWORD;
  process.env.DB_NAME = process.env.MYSQLDATABASE;
}

// ── Startup Validation ────────────────────────────────────────
const REQUIRED_ENV = ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`[STARTUP] Missing env vars: ${missing.join(', ')}`);
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.error('[STARTUP] JWT_SECRET too short');
  process.exit(1);
}

const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const morgan      = require('morgan');
const compression = require('compression');
const rateLimit   = require('express-rate-limit');
const path        = require('path');
const http        = require('http');
const { Server }  = require('socket.io');
const fs          = require('fs');

const app    = express();
const server = http.createServer(app);

// ── CORS — Railway domain + custom APP_URL ────────────────────
const rawOrigins = (process.env.APP_URL || '').split(',').map(s => s.trim()).filter(Boolean);
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (process.env.NODE_ENV !== 'production') return cb(null, true);
    if (!rawOrigins.length) return cb(null, true); // no restriction if not set
    if (rawOrigins.some(o => origin.startsWith(o))) return cb(null, true);
    cb(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
};

const io = new Server(server, { cors: corsOptions, transports: ['websocket','polling'] });
global.io = io;

// ── Middleware ────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false })); // Railway handles TLS
app.use(compression());
app.use(cors(corsOptions));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Logging — skip verbose in Railway (use Railway logs dashboard)
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));
else app.use(morgan('tiny'));

// ── Rate Limiting ─────────────────────────────────────────────
app.use('/api/', rateLimit({ windowMs:15*60*1000, max:300, standardHeaders:true, legacyHeaders:false }));
app.use('/api/v1/auth/', rateLimit({ windowMs:15*60*1000, max:20, message:{error:'RATE_LIMIT',message:'ถี่เกินไป'} }));
app.use('/api/v1/wallet/deposit', rateLimit({ windowMs:5*60*1000, max:10 }));

// ── Static Files (uploaded files go to Railway volume or /tmp) ─
const uploadDir = process.env.UPLOAD_DIR || '/tmp/tgl_uploads';
fs.mkdirSync(uploadDir + '/kyc', { recursive: true });
app.use('/uploads', express.static(uploadDir, {
  setHeaders: (res) => {
    res.setHeader('Content-Disposition', 'attachment');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
}));

// Frontend static files
const frontendDir = path.join(__dirname, '../frontend');
app.use(express.static(frontendDir, { maxAge: '1h' }));

// ── Controllers ───────────────────────────────────────────────
const authCtrl   = require('./controllers/authController');
const walletCtrl = require('./controllers/walletController');
const slipCtrl   = require('./controllers/slipController');
const resultCtrl = require('./controllers/resultController');
const agentCtrl  = require('./controllers/agentController');
const kycCtrl    = require('./controllers/kycController');
const bankCtrl   = require('./controllers/bankController');
const { auth, adminOnly, agentOnly } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const { query, queryOne } = require('./config/db');

// ── V1 Router ─────────────────────────────────────────────────
const v1 = express.Router();

/* AUTH */
v1.post('/auth/register',   authCtrl.register);
v1.post('/auth/login',      authCtrl.login);
v1.post('/auth/refresh',    authCtrl.refreshToken);
v1.post('/auth/logout',     auth, authCtrl.logout);
v1.post('/auth/otp/send',   authCtrl.sendOTP);
v1.post('/auth/otp/verify', authCtrl.verifyOTP);

/* ME */
v1.get('/me', auth, async (req,res) => {
  try {
    const user = await queryOne(
      'SELECT id,uuid,phone,email,first_name,last_name,role,vip_tier,vip_points,referral_code,is_verified,last_login_at,created_at FROM users WHERE id=?',
      [req.user.id]
    );
    res.json(user);
  } catch(e){ res.status(500).json({error:'SERVER_ERROR'}); }
});
v1.put('/me', auth, async (req,res) => {
  try {
    const fn = (req.body.first_name||'').trim().substring(0,50);
    const ln = (req.body.last_name||'').trim().substring(0,50);
    const em = (req.body.email||'').trim().substring(0,100);
    const dn = (req.body.display_name||'').trim().substring(0,50);
    if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em))
      return res.status(422).json({error:'VALIDATION',message:'อีเมลไม่ถูกต้อง'});
    await query('UPDATE users SET first_name=?,last_name=?,email=?,display_name=? WHERE id=?',
      [fn,ln,em||null,dn||null,req.user.id]);
    res.json({success:true});
  } catch(e){ res.status(500).json({error:'SERVER_ERROR'}); }
});
v1.put('/me/password', auth, async (req,res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { old_password, new_password } = req.body;
    if (!new_password||new_password.length<8)
      return res.status(422).json({error:'VALIDATION',message:'รหัสผ่านต้องมีอย่างน้อย 8 ตัว'});
    if (!/[A-Za-z]/.test(new_password)||!/[0-9]/.test(new_password))
      return res.status(422).json({error:'VALIDATION',message:'ต้องมีทั้งตัวอักษรและตัวเลข'});
    const user = await queryOne('SELECT password_hash FROM users WHERE id=?',[req.user.id]);
    if (!await bcrypt.compare(old_password,user.password_hash))
      return res.status(422).json({error:'WRONG_PASSWORD',message:'รหัสผ่านเดิมผิด'});
    await query('UPDATE users SET password_hash=?,token_version=token_version+1 WHERE id=?',
      [await bcrypt.hash(new_password,12),req.user.id]);
    res.json({success:true,message:'เปลี่ยนรหัสผ่านแล้ว กรุณา login ใหม่'});
  } catch(e){ res.status(500).json({error:'SERVER_ERROR'}); }
});

/* KYC */
v1.get('/me/kyc',  auth, kycCtrl.getKYCStatus);
v1.post('/me/kyc', auth, kycCtrl.upload.fields([{name:'id_card_image',maxCount:1},{name:'selfie_image',maxCount:1}]), kycCtrl.submitKYC);

/* BANK */
v1.get('/me/banks',             auth, bankCtrl.list);
v1.post('/me/banks',            auth, bankCtrl.add);
v1.put('/me/banks/:id/default', auth, bankCtrl.setDefault);
v1.delete('/me/banks/:id',      auth, bankCtrl.remove);

/* WALLET */
v1.get('/wallet',              auth, walletCtrl.getWallet);
v1.post('/wallet/deposit',     auth, walletCtrl.deposit);
v1.post('/wallet/withdraw',    auth, walletCtrl.withdraw);
v1.get('/wallet/transactions', auth, walletCtrl.getTransactions);

/* LOTTERY */
v1.get('/lottery/types', async(req,res)=>{
  try{ res.json({data:await query('SELECT * FROM lottery_types WHERE is_active=1 ORDER BY sort_order')}); }
  catch(e){ res.status(500).json({error:'SERVER_ERROR'}); }
});
v1.get('/lottery/rounds', async(req,res)=>{
  try{
    const VS=['open','closed','resulted'];
    const st=VS.includes(req.query.status)?req.query.status:'open';
    let sql=`SELECT r.*,lt.name,lt.icon FROM lottery_rounds r JOIN lottery_types lt ON r.lottery_type_id=lt.id WHERE r.status=?`;
    const p=[st];
    if(req.query.lottery_type){sql+=' AND lt.code=?';p.push(req.query.lottery_type);}
    sql+=' ORDER BY r.close_at ASC LIMIT 50';
    res.json({data:await query(sql,p)});
  }catch(e){ res.status(500).json({error:'SERVER_ERROR'}); }
});
v1.get('/lottery/rounds/:id', async(req,res)=>{
  try{
    const row=await queryOne('SELECT r.*,lt.name,lt.icon FROM lottery_rounds r JOIN lottery_types lt ON r.lottery_type_id=lt.id WHERE r.id=?',[req.params.id]);
    if(!row)return res.status(404).json({error:'NOT_FOUND'});
    res.json(row);
  }catch(e){ res.status(500).json({error:'SERVER_ERROR'}); }
});
v1.get('/lottery/rounds/:id/result', async(req,res)=>{
  try{
    const row=await queryOne('SELECT * FROM lottery_results WHERE round_id=?',[req.params.id]);
    if(!row)return res.status(404).json({error:'NOT_FOUND',message:'ยังไม่มีผล'});
    res.json(row);
  }catch(e){ res.status(500).json({error:'SERVER_ERROR'}); }
});
v1.get('/lottery/bet-types', async(req,res)=>{
  try{
    let sql='SELECT * FROM bet_types WHERE is_active=1';const p=[];
    if(req.query.lottery_type_id&&!isNaN(+req.query.lottery_type_id)){sql+=' AND lottery_type_id=?';p.push(+req.query.lottery_type_id);}
    res.json({data:await query(sql,p)});
  }catch(e){ res.status(500).json({error:'SERVER_ERROR'}); }
});
v1.get('/lottery/results', async(req,res)=>{
  try{
    const page=Math.max(+req.query.page||1,1),limit=Math.min(+req.query.limit||10,50);
    let sql=`SELECT lr.*,r.round_code,lt.name AS lottery_name FROM lottery_results lr JOIN lottery_rounds r ON lr.round_id=r.id JOIN lottery_types lt ON r.lottery_type_id=lt.id WHERE 1=1`;
    const p=[];
    if(req.query.lottery_type){sql+=' AND lt.code=?';p.push(req.query.lottery_type);}
    sql+=' ORDER BY lr.created_at DESC LIMIT ? OFFSET ?';
    p.push(limit,(page-1)*limit);
    res.json({data:await query(sql,p)});
  }catch(e){ res.status(500).json({error:'SERVER_ERROR'}); }
});

/* SLIPS */
v1.get('/slips',        auth, slipCtrl.getSlips);
v1.get('/slips/:id',    auth, slipCtrl.getSlip);
v1.post('/slips',       auth, slipCtrl.createSlip);
v1.delete('/slips/:id', auth, slipCtrl.cancelSlip);

/* NOTIFICATIONS */
v1.get('/notifications', auth, async(req,res)=>{
  try{
    const limit=Math.min(+req.query.limit||20,50),page=Math.max(+req.query.page||1,1);
    let sql='SELECT * FROM notifications WHERE user_id=?';const p=[req.user.id];
    if(req.query.is_read==='0'||req.query.is_read==='1'){sql+=' AND is_read=?';p.push(+req.query.is_read);}
    sql+=' ORDER BY created_at DESC LIMIT ? OFFSET ?';p.push(limit,(page-1)*limit);
    const[data,unread]=await Promise.all([query(sql,p),queryOne('SELECT COUNT(*) AS c FROM notifications WHERE user_id=? AND is_read=0',[req.user.id])]);
    res.json({data,unread_count:unread.c});
  }catch(e){ res.status(500).json({error:'SERVER_ERROR'}); }
});
v1.put('/notifications/read-all',auth,async(req,res)=>{
  try{await query('UPDATE notifications SET is_read=1,read_at=NOW() WHERE user_id=?',[req.user.id]);res.json({success:true});}
  catch(e){res.status(500).json({error:'SERVER_ERROR'});}
});
v1.put('/notifications/:id/read',auth,async(req,res)=>{
  try{await query('UPDATE notifications SET is_read=1,read_at=NOW() WHERE id=? AND user_id=?',[req.params.id,req.user.id]);res.json({success:true});}
  catch(e){res.status(500).json({error:'SERVER_ERROR'});}
});

/* PROMOTIONS */
v1.get('/promotions',async(req,res)=>{
  try{res.json({data:await query('SELECT * FROM promotions WHERE is_active=1 ORDER BY is_featured DESC')});}
  catch(e){res.status(500).json({error:'SERVER_ERROR'});}
});
v1.post('/promotions/:id/claim',auth,async(req,res)=>{
  try{
    const id=parseInt(req.params.id);
    const promo=await queryOne('SELECT * FROM promotions WHERE id=? AND is_active=1',[id]);
    if(!promo)return res.status(404).json({error:'NOT_FOUND'});
    const already=await queryOne('SELECT id FROM user_promotions WHERE user_id=? AND promotion_id=?',[req.user.id,id]);
    if(already)return res.status(409).json({error:'ALREADY_CLAIMED'});
    const amount=parseFloat(promo.max_amount||0);
    await query('INSERT INTO user_promotions (user_id,promotion_id,amount_received) VALUES (?,?,?)',[req.user.id,id,amount]);
    if(amount>0)await query('UPDATE wallets SET balance=balance+?,bonus_balance=bonus_balance+? WHERE user_id=?',[amount,amount,req.user.id]);
    res.json({success:true,amount_received:amount});
  }catch(e){res.status(500).json({error:'SERVER_ERROR'});}
});

/* AGENT */
v1.get('/agent/dashboard',            auth,agentOnly,agentCtrl.getDashboard);
v1.get('/agent/members',              auth,agentOnly,agentCtrl.getMembers);
v1.get('/agent/sub-agents',           auth,agentOnly,agentCtrl.getSubAgents);
v1.get('/agent/commissions',          auth,agentOnly,agentCtrl.getCommissions);
v1.post('/agent/withdraw-commission', auth,agentOnly,agentCtrl.withdrawCommission);
v1.get('/agent/referral-link',        auth,agentOnly,agentCtrl.getReferralLink);

/* ADMIN */
v1.get('/admin/dashboard',auth,adminOnly,async(req,res)=>{
  try{
    const[members,active,withdraw,revenue,pkyc]=await Promise.all([
      queryOne('SELECT COUNT(*) AS c FROM users WHERE role="member"'),
      queryOne('SELECT COUNT(*) AS c FROM users WHERE DATE(last_login_at)=CURDATE()'),
      queryOne("SELECT SUM(amount) AS t FROM transactions WHERE type='withdraw' AND status='pending'"),
      queryOne("SELECT SUM(amount) AS t FROM transactions WHERE type='bet' AND DATE(created_at)=CURDATE()"),
      queryOne("SELECT COUNT(*) AS c FROM user_kyc WHERE status='pending'"),
    ]);
    res.json({total_members:members.c,active_today:active.c,pending_withdraw:withdraw.t||0,revenue_today:revenue.t||0,pending_kyc:pkyc.c});
  }catch(e){res.status(500).json({error:'SERVER_ERROR'});}
});
v1.get('/admin/users',auth,adminOnly,async(req,res)=>{
  try{
    const VS=['member','agent','sub_agent','admin','superadmin'];
    const limit=Math.min(+req.query.limit||50,200),page=Math.max(+req.query.page||1,1);
    let sql='SELECT id,phone,first_name,last_name,role,vip_tier,is_active,is_verified,created_at FROM users WHERE 1=1';const p=[];
    if(req.query.role&&VS.includes(req.query.role)){sql+=' AND role=?';p.push(req.query.role);}
    sql+=' ORDER BY created_at DESC LIMIT ? OFFSET ?';p.push(limit,(page-1)*limit);
    res.json({data:await query(sql,p)});
  }catch(e){res.status(500).json({error:'SERVER_ERROR'});}
});
v1.put('/admin/users/:id/status',auth,adminOnly,async(req,res)=>{
  try{
    const uid=parseInt(req.params.id);
    await query('UPDATE users SET is_active=?,is_banned=? WHERE id=?',[req.body.is_active?1:0,req.body.is_banned?1:0,uid]);
    if(req.body.is_banned)await query('UPDATE users SET token_version=token_version+1 WHERE id=?',[uid]);
    res.json({success:true});
  }catch(e){res.status(500).json({error:'SERVER_ERROR'});}
});
v1.get('/admin/transactions',auth,adminOnly,async(req,res)=>{
  try{
    const VT=['deposit','withdraw','bet','win','bonus','refund'],VS=['pending','success','failed','cancelled'];
    const limit=Math.min(+req.query.limit||50,200),page=Math.max(+req.query.page||1,1);
    let sql=`SELECT t.id,t.ref_no,t.type,t.amount,t.status,t.created_at,t.payment_method,u.first_name,u.last_name,u.phone FROM transactions t JOIN users u ON t.user_id=u.id WHERE 1=1`;const p=[];
    if(req.query.type&&VT.includes(req.query.type)){sql+=' AND t.type=?';p.push(req.query.type);}
    if(req.query.status&&VS.includes(req.query.status)){sql+=' AND t.status=?';p.push(req.query.status);}
    sql+=' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';p.push(limit,(page-1)*limit);
    res.json({data:await query(sql,p)});
  }catch(e){res.status(500).json({error:'SERVER_ERROR'});}
});
v1.put('/admin/transactions/:id/approve',auth,adminOnly,async(req,res)=>{
  try{
    const id=parseInt(req.params.id);
    const tx=await queryOne("SELECT * FROM transactions WHERE id=? AND status='pending'",[id]);
    if(!tx)return res.status(404).json({error:'NOT_FOUND'});
    if(tx.type==='deposit') await walletCtrl.approveDeposit(id,tx.user_id,tx.amount);
    else if(tx.type==='withdraw'){
      await query("UPDATE transactions SET status='success',processed_by=?,processed_at=NOW() WHERE id=?",[req.user.id,id]);
      await query('UPDATE wallets SET locked_balance=locked_balance-? WHERE user_id=?',[tx.amount,tx.user_id]);
    }else return res.status(422).json({error:'INVALID_TYPE'});
    await query(`INSERT INTO notifications (user_id,type,title,body) VALUES (?,'system',?,?)`,[tx.user_id,tx.type==='deposit'?'✅ ฝากเงินสำเร็จ':'✅ ถอนเงินสำเร็จ',`รายการ ${tx.ref_no} จำนวน ฿${parseFloat(tx.amount).toLocaleString()} ดำเนินการแล้ว`]);
    res.json({success:true});
  }catch(e){
    if(e.code==='ALREADY_PROCESSED')return res.status(409).json({error:'ALREADY_PROCESSED'});
    res.status(500).json({error:'SERVER_ERROR'});
  }
});
v1.post('/admin/lottery/rounds/:id/result',auth,adminOnly,resultCtrl.enterResult);
v1.get('/admin/kyc',             auth,adminOnly,kycCtrl.adminListKYC);
v1.put('/admin/kyc/:id/approve', auth,adminOnly,kycCtrl.approveKYC);
v1.put('/admin/kyc/:id/reject',  auth,adminOnly,kycCtrl.rejectKYC);
v1.get('/admin/hot-numbers',auth,adminOnly,async(req,res)=>{
  try{
    const limit=Math.min(+req.query.limit||20,100);let sql='SELECT * FROM hot_numbers WHERE 1=1';const p=[];
    if(req.query.round_id&&!isNaN(+req.query.round_id)){sql+=' AND round_id=?';p.push(+req.query.round_id);}
    sql+=' ORDER BY total_amount DESC LIMIT ?';p.push(limit);
    res.json({data:await query(sql,p)});
  }catch(e){res.status(500).json({error:'SERVER_ERROR'});}
});
v1.get('/admin/settings',auth,adminOnly,async(req,res)=>{
  try{res.json({data:await query('SELECT * FROM system_settings ORDER BY group_name,`key`')});}
  catch(e){res.status(500).json({error:'SERVER_ERROR'});}
});
v1.put('/admin/settings/:key',auth,adminOnly,async(req,res)=>{
  try{await query("UPDATE system_settings SET value=?,updated_by=?,updated_at=NOW() WHERE `key`=?",[String(req.body.value||'').substring(0,500),req.user.id,req.params.key.substring(0,100)]);res.json({success:true});}
  catch(e){res.status(500).json({error:'SERVER_ERROR'});}
});
v1.get('/admin/reports/monthly',auth,adminOnly,async(req,res)=>{
  try{
    const y=Math.max(+req.query.year||new Date().getFullYear(),2020);
    const m=Math.min(Math.max(+req.query.month||new Date().getMonth()+1,1),12);
    const[rev,pay,mem,bet]=await Promise.all([
      queryOne(`SELECT SUM(amount) AS t FROM transactions WHERE type='deposit' AND status='success' AND YEAR(created_at)=? AND MONTH(created_at)=?`,[y,m]),
      queryOne(`SELECT SUM(amount) AS t FROM transactions WHERE type='win' AND YEAR(created_at)=? AND MONTH(created_at)=?`,[y,m]),
      queryOne(`SELECT COUNT(*) AS c FROM users WHERE YEAR(created_at)=? AND MONTH(created_at)=?`,[y,m]),
      queryOne(`SELECT SUM(amount) AS t FROM transactions WHERE type='bet' AND YEAR(created_at)=? AND MONTH(created_at)=?`,[y,m]),
    ]);
    res.json({year:y,month:m,revenue:rev.t||0,payout:pay.t||0,profit:(rev.t||0)-(pay.t||0),new_members:mem.c,total_bets:bet.t||0});
  }catch(e){res.status(500).json({error:'SERVER_ERROR'});}
});

app.use('/api/v1', v1);

/* HEALTH */
app.get('/health', async(req,res)=>{
  try{
    const { pool } = require('./config/db');
    await pool.execute('SELECT 1');
    res.json({status:'ok',db:'connected',uptime:Math.floor(process.uptime()),env:process.env.NODE_ENV});
  }catch{res.status(503).json({status:'error',db:'disconnected'});}
});

/* SPA routes */
app.get('/desktop*', (req,res) => {
  const f = path.join(frontendDir,'desktop/index.html');
  if(fs.existsSync(f)) return res.sendFile(f);
  res.redirect('/');
});
app.get('*', (req,res) => {
  if(req.path.startsWith('/api/'))return res.status(404).json({error:'NOT_FOUND'});
  const f = path.join(frontendDir,'index.html');
  if(fs.existsSync(f)) return res.sendFile(f);
  res.status(404).send('Not found');
});

app.use(errorHandler);

io.on('connection', socket => {
  socket.on('join_round', id => socket.join(`round:${id}`));
  socket.on('join_user',  id => socket.join(`user:${id}`));
});

// ── Auto-migrate on startup ───────────────────────────────────
async function runMigrations() {
  try {
    const { default: migrate } = await import('./scripts/migrate.js').catch(() => ({ default: null }));
    if (!migrate) {
      require('./scripts/migrate.js');
    }
  } catch(e) {
    console.warn('[server] Migration skipped:', e.message);
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`🐯 TigerLotto :${PORT} [${process.env.NODE_ENV||'dev'}]`);
  // Run migrations after server is up
  setTimeout(() => {
    require('./scripts/migrate.js');
  }, 2000);
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT',  () => { server.close(() => process.exit(0)); });
