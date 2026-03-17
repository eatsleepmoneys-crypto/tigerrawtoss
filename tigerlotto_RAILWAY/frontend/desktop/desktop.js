/**
 * TigerLotto Desktop — desktop.js
 * PC layout logic — sidebar navigation, buy panel, full table views
 */

// ── State ─────────────────────────────────────────────────────
let DS = {
  user: null, wallet: null, lotteryTypes: [], rounds: [],
  mySlips: [], betTypes: [], buyRound: null, buyItems: [],
  selectedBetType: null, currentPage: 'home',
  depositMethod: 'qr_promptpay',
};

// ── Init ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  if (isLoggedIn()) {
    const { user } = getSession();
    DS.user = user;
    document.getElementById('authOverlay').classList.add('hidden');
    await Promise.all([loadWallet(), loadLotteryTypes()]);
    updateSidebar();
    renderHomePage();
    loadNotifBadge();
  }
});

// ── AUTH ──────────────────────────────────────────────────────
function authMode(mode) {
  document.getElementById('aform-login').style.display = mode === 'login' ? 'block' : 'none';
  document.getElementById('aform-reg').style.display   = mode === 'register' ? 'block' : 'none';
  document.getElementById('atab-login').classList.toggle('active', mode === 'login');
  document.getElementById('atab-reg').classList.toggle('active', mode === 'register');
}

async function doLogin() {
  const phone    = document.getElementById('a-phone').value.trim();
  const password = document.getElementById('a-pass').value;
  if (!phone || !password) return toast('กรุณากรอกเบอร์และรหัสผ่าน', 'warn');
  const btn = document.getElementById('btn-login');
  btn.textContent = '⏳ กำลังเข้าสู่ระบบ...'; btn.disabled = true;
  try {
    const res = await Auth.login({ phone, password });
    saveSession(res.token, res.user);
    DS.user = res.user;
    document.getElementById('authOverlay').classList.add('hidden');
    await Promise.all([loadWallet(), loadLotteryTypes()]);
    updateSidebar();
    renderHomePage();
    loadNotifBadge();
    toast('✅ ยินดีต้อนรับ ' + res.user.first_name, 'ok');
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    btn.textContent = '🐯 เข้าสู่ระบบ'; btn.disabled = false;
  }
}

async function doRegister() {
  const first_name    = document.getElementById('r-fname').value.trim();
  const last_name     = document.getElementById('r-lname').value.trim();
  const phone         = document.getElementById('r-phone').value.trim();
  const password      = document.getElementById('r-pass').value;
  const referral_code = document.getElementById('r-ref').value.trim();
  if (!first_name || !last_name || !phone || !password)
    return toast('กรุณากรอกข้อมูลให้ครบ', 'warn');
  try {
    const res = await Auth.register({ first_name, last_name, phone, password, referral_code });
    saveSession(res.token, res.user);
    DS.user = res.user;
    document.getElementById('authOverlay').classList.add('hidden');
    await Promise.all([loadWallet(), loadLotteryTypes()]);
    updateSidebar();
    renderHomePage();
    toast('🎉 สมัครสำเร็จ!', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

function doLogout() {
  clearSession();
  DS = { user:null, wallet:null, lotteryTypes:[], rounds:[], mySlips:[], betTypes:[], buyRound:null, buyItems:[], selectedBetType:null, currentPage:'home', depositMethod:'qr_promptpay' };
  document.getElementById('authOverlay').classList.remove('hidden');
  toast('ออกจากระบบแล้ว', 'ok');
}

// ── Sidebar + Nav ─────────────────────────────────────────────
function updateSidebar() {
  if (!DS.user) return;
  const init = (DS.user.first_name || '?').charAt(0);
  document.getElementById('sbAvatar').textContent = init;
  document.getElementById('sbName').textContent   = DS.user.first_name + ' ' + DS.user.last_name;
  const VIP = { bronze:'🥉 Bronze', silver:'🥈 Silver', gold:'⭐ Gold', platinum:'💎 Platinum', diamond:'👑 Diamond' };
  document.getElementById('sbRole').textContent   = VIP[DS.user.vip_tier] || 'Member';
  if (DS.wallet) {
    document.getElementById('sbBal').textContent   = '฿' + fmtNum(DS.wallet.balance);
    document.getElementById('sbBonus').textContent = fmtNum(DS.wallet.bonus_balance || 0);
  }
}

const PAGE_TITLES = {
  home:'ภาพรวม', buy:'ซื้อหวย', result:'ผลรางวัล',
  slips:'โพยของฉัน', wallet:'กระเป๋าเงิน', promo:'โปรโมชั่น',
  agent:'Agent Portal', profile:'โปรไฟล์',
};

function navTo(page) {
  DS.currentPage = page;
  // Update sidebar active
  document.querySelectorAll('.sb-item').forEach(el => el.classList.remove('active'));
  const sbEl = document.getElementById('sbNav-' + page);
  if (sbEl) sbEl.classList.add('active');
  // Update topbar title
  document.getElementById('pageTitle').textContent = PAGE_TITLES[page] || page;
  // Show/hide pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pgEl = document.getElementById('pg-' + page);
  if (pgEl) pgEl.classList.add('active');
  // Load content
  const loaders = {
    home:    renderHomePage,
    buy:     renderBuyPage,
    result:  renderResultPage,
    slips:   renderSlipsPage,
    wallet:  renderWalletPage,
    promo:   renderPromoPage,
    agent:   renderAgentPage,
    profile: renderProfilePage,
  };
  if (loaders[page]) loaders[page]();
}

// ── Data Loaders ──────────────────────────────────────────────
async function loadWallet() {
  try {
    DS.wallet = await Wallet.get();
    updateSidebar();
    // Update home KPIs if visible
    if (document.getElementById('h-balance'))
      document.getElementById('h-balance').textContent = '฿' + fmtNum(DS.wallet.balance);
    if (document.getElementById('h-bonus'))
      document.getElementById('h-bonus').textContent = fmtNum(DS.wallet.bonus_balance || 0);
    if (document.getElementById('h-won'))
      document.getElementById('h-won').textContent = '฿' + fmtNum(DS.wallet.total_won || 0);
  } catch {}
}

async function loadLotteryTypes() {
  try {
    const res = await Lottery.types();
    DS.lotteryTypes = res.data || [];
  } catch {}
}

async function loadRounds() {
  try {
    const res = await Lottery.rounds({ status: 'open' });
    DS.rounds = res.data || [];
  } catch { DS.rounds = []; }
}

// ── HOME PAGE ─────────────────────────────────────────────────
async function renderHomePage() {
  if (DS.wallet) {
    document.getElementById('h-balance').textContent = '฿' + fmtNum(DS.wallet.balance);
    document.getElementById('h-bonus').textContent   = fmtNum(DS.wallet.bonus_balance || 0);
    document.getElementById('h-won').textContent     = '฿' + fmtNum(DS.wallet.total_won || 0);
  }
  if (DS.user) {
    document.getElementById('h-vip').textContent  = DS.user.vip_points || 0;
    const VIP = { bronze:'🥉 Bronze', silver:'🥈 Silver', gold:'⭐ Gold', platinum:'💎 Platinum' };
    document.getElementById('h-tier').textContent = VIP[DS.user.vip_tier] || 'Bronze';
  }
  renderLottoGrid();
  loadRecentResults();
  loadRecentSlips();
}

const TYPE_META = {
  gov:    { icon:'🇹🇭', rate:900, bg:'#1A1200', bd:'#B8860B44', sub:'งวด 1, 16 ทุกเดือน' },
  yeekee: { icon:'⚡',  rate:700, bg:'#0a1a0a', bd:'#3BD44133', sub:'90 รอบ/วัน' },
  set:    { icon:'📈',  rate:680, bg:'#0a0a1a', bd:'#5B9CF633', sub:'เช้า + บ่าย' },
  hanoi:  { icon:'🌏',  rate:750, bg:'#1a0a00', bd:'#D85A3033', sub:'ทุกวัน 17:30' },
  laos:   { icon:'🇱🇦', rate:700, bg:'#111',    bd:'#1e1e2a',   sub:'ทุกวัน 20:00' },
};

function renderLottoGrid() {
  const grid = document.getElementById('h-lottoGrid');
  if (!grid) return;
  const types = DS.lotteryTypes.length ? DS.lotteryTypes : [
    { id:1, code:'gov', name:'หวยรัฐบาล' },
    { id:2, code:'yeekee', name:'ยี่กี 24ชม.' },
    { id:3, code:'hanoi', name:'ฮานอย' },
    { id:4, code:'set', name:'หุ้น SET' },
  ];
  grid.innerHTML = types.slice(0,4).map(lt => {
    const m = TYPE_META[lt.code] || { icon:'🎯', rate:700, bg:'#111', bd:'#1e1e2a', sub:'' };
    return `
    <div class="lotto-pc-card" onclick="openBuyPanel('${lt.id}','${lt.code}')" style="border-color:${m.bd};background:linear-gradient(160deg,${m.bg},var(--bg2))">
      <div class="lotto-pc-card-top">
        <div class="lotto-pc-icon" style="background:${m.bg};border:1px solid ${m.bd}">${m.icon}</div>
        <div>
          <div class="lotto-pc-name">${lt.name}</div>
          <div class="lotto-pc-code">⏰ ${m.sub}</div>
        </div>
      </div>
      <div class="lotto-pc-rate">×${m.rate} <span>บาท (3 ตัวบน)</span></div>
      <button class="lotto-pc-buy" onclick="event.stopPropagation();openBuyPanel('${lt.id}','${lt.code}')">🎟 ซื้อเลย</button>
    </div>`;
  }).join('');
}

async function loadRecentResults() {
  const el = document.getElementById('h-recentResults');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:10px">⏳ กำลังโหลด...</div>';
  try {
    const res = await Lottery.results({ limit: 6 });
    if (!res.data?.length) { el.innerHTML = '<div style="color:var(--text3);text-align:center;padding:20px">ยังไม่มีผล</div>'; return; }
    el.innerHTML = res.data.map(r => `
      <div class="card" style="margin-bottom:10px;padding:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--gold)">${r.lottery_name}</div>
            <div style="font-size:11px;color:var(--text3)">${r.round_code}</div>
          </div>
          <span class="badge badge-success">✅ ออกผล</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          <div style="text-align:center">
            <div style="font-size:10px;color:var(--text3);margin-bottom:3px">รางวัลที่ 1</div>
            <div class="result-big" style="font-size:20px;color:var(--gold)">${r.result_first || '——'}</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:10px;color:var(--text3);margin-bottom:3px">2 ตัวท้าย</div>
            <div class="result-big" style="font-size:20px;color:var(--blue)">${r.result_2_back || '--'}</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:10px;color:var(--text3);margin-bottom:3px">3 ตัวท้าย</div>
            <div class="result-big" style="font-size:18px;color:#FF8A5A">${r.result_3_back1 || '---'}</div>
          </div>
        </div>
      </div>`).join('');
  } catch { el.innerHTML = '<div style="color:var(--red);font-size:12px;padding:10px">โหลดไม่ได้</div>'; }
}

async function loadRecentSlips() {
  const tbody = document.getElementById('h-slipBody');
  if (!tbody) return;
  try {
    const res = await Slips.list({ limit: 5 });
    const slips = res.data || [];
    const count = document.getElementById('h-slips');
    if (count) count.textContent = res.total || slips.length;
    if (!slips.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:24px">ยังไม่มีโพย</td></tr>';
      return;
    }
    tbody.innerHTML = slips.map(s => {
      const stMap = { active:'<span class="badge badge-pending">● รับแทง</span>', won:'<span class="badge badge-success">🏆 ถูกรางวัล</span>', lost:'<span class="badge" style="background:var(--bg3);color:var(--text3);border:1px solid var(--border)">ไม่ถูก</span>', cancelled:'<span class="badge badge-fail">ยกเลิก</span>' };
      const win = parseFloat(s.total_payout || 0);
      return `<tr>
        <td><span class="result-big" style="font-size:11px;color:var(--text3)">${s.slip_no}</span></td>
        <td><div style="font-weight:600;color:var(--text)">${s.lottery_name || ''}</div><div style="font-size:11px;color:var(--text3)">${s.round_code || ''}</div></td>
        <td style="color:var(--text3)">${(s.items||[]).length} รายการ</td>
        <td style="font-weight:700;color:var(--gold)">฿${fmtNum(s.total_amount)}</td>
        <td>${stMap[s.status] || s.status}</td>
        <td style="font-weight:700;color:${win > 0 ? 'var(--green)' : 'var(--text3)'}">${win > 0 ? '+฿'+fmtNum(win) : '—'}</td>
      </tr>`;
    }).join('');
  } catch { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:24px">โหลดไม่ได้</td></tr>'; }
}

// ── BUY PAGE ──────────────────────────────────────────────────
async function renderBuyPage() {
  await loadRounds();
  const el = document.getElementById('buy-rounds');
  if (!el) return;
  if (!DS.rounds.length) {
    el.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text3);padding:40px">ไม่มีงวดที่เปิดรับในขณะนี้</div>';
    return;
  }
  el.innerHTML = DS.rounds.map(r => {
    const m = TYPE_META[r.code] || { icon:'🎯', bd:'#1e1e2a', bg:'#111' };
    const tl = new Date(r.close_at) - Date.now();
    const mins = Math.max(0, Math.floor(tl / 60000));
    const secs = Math.max(0, Math.floor((tl % 60000) / 1000));
    const cdCls = tl < 5*60000 ? 'badge-fail' : tl < 15*60000 ? 'badge-pending' : 'badge-success';
    return `
    <div class="lotto-pc-card" style="border-color:${m.bd};background:linear-gradient(160deg,${m.bg},var(--bg2))">
      <div class="lotto-pc-card-top">
        <div class="lotto-pc-icon" style="background:${m.bg};border:1px solid ${m.bd}">${m.icon || r.icon || '🎯'}</div>
        <div>
          <div class="lotto-pc-name">${r.name || r.round_code}</div>
          <div class="lotto-pc-code">${r.round_code}</div>
        </div>
      </div>
      <div style="margin-bottom:10px">
        <span class="badge ${cdCls}" id="cd-${r.id}">⏱ ปิดรับใน ${mins}:${String(secs).padStart(2,'0')}</span>
      </div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:4px">ยอดรวม: <span style="color:var(--gold);font-weight:700">฿${fmtNum(r.total_bet_amount || 0)}</span></div>
      <button class="lotto-pc-buy" onclick="openBuyPanel('${r.id}','${r.name||r.round_code}')">🎟 ซื้อหวยงวดนี้</button>
    </div>`;
  }).join('');
  startCDs();
}

function startCDs() {
  DS.rounds.forEach(r => {
    const iv = setInterval(() => {
      const el = document.getElementById('cd-' + r.id);
      if (!el) { clearInterval(iv); return; }
      const tl = new Date(r.close_at) - Date.now();
      if (tl <= 0) { el.textContent = '⏰ ปิดรับแล้ว'; el.className = 'badge badge-fail'; clearInterval(iv); return; }
      const m = Math.floor(tl/60000), s = Math.floor((tl%60000)/1000);
      el.textContent = `⏱ ปิดรับใน ${m}:${String(s).padStart(2,'0')}`;
      el.className = `badge ${tl < 5*60000 ? 'badge-fail' : tl < 15*60000 ? 'badge-pending' : 'badge-success'}`;
    }, 1000);
  });
}

// ── BUY PANEL ─────────────────────────────────────────────────
async function openBuyPanel(roundId, roundName) {
  await loadRounds();
  const r = DS.rounds.find(x => String(x.id) === String(roundId));
  if (!r && DS.rounds.length) {
    // Try by lottery_type_id
    const lt = DS.lotteryTypes.find(x => String(x.id) === String(roundId));
    if (!lt) return toast('กรุณารอเปิดงวด', 'warn');
    await loadRounds();
    return toast('กำลังโหลดงวดที่เปิดรับ...', 'warn');
  }
  if (r && new Date(r.close_at) - Date.now() <= 0) return toast('หมดเวลารับแทงแล้ว', 'warn');

  // Use first open round of this lottery type if no specific round found
  const round = r || DS.rounds[0];
  if (!round) return toast('ไม่มีงวดที่เปิดรับ', 'warn');

  DS.buyRound = round;
  DS.buyItems = [];

  try {
    const res = await Lottery.betTypes(round.lottery_type_id);
    DS.betTypes = res.data || [];
  } catch { DS.betTypes = []; }

  document.getElementById('bp-title').textContent = '🎟 ' + (roundName || round.round_code);
  document.getElementById('bp-round').textContent = round.round_code;

  // Render bet types
  const bpBt = document.getElementById('bp-betTypes');
  bpBt.innerHTML = DS.betTypes.slice(0,8).map(bt => `
    <button id="bpbt-${bt.id}" onclick="selectBT(${bt.id},'${bt.name}',${bt.payout_rate})"
      style="padding:6px 12px;border-radius:9px;background:var(--bg3);border:1.5px solid var(--border2);color:var(--text2);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:.15s">
      ${bt.name} ×${parseFloat(bt.payout_rate).toFixed(0)}
    </button>`).join('');

  if (DS.betTypes.length) selectBT(DS.betTypes[0].id, DS.betTypes[0].name, DS.betTypes[0].payout_rate);
  renderBuyList();
  document.getElementById('buyPanel').classList.add('open');
}

function closeBuyPanel() { document.getElementById('buyPanel').classList.remove('open'); }

function selectBT(id, name, rate) {
  DS.selectedBetType = { id, name, rate };
  document.querySelectorAll('[id^="bpbt-"]').forEach(b => {
    b.style.background = 'var(--bg3)'; b.style.borderColor = 'var(--border2)'; b.style.color = 'var(--text2)';
  });
  const btn = document.getElementById('bpbt-' + id);
  if (btn) { btn.style.background = 'rgba(255,215,0,.1)'; btn.style.borderColor = 'var(--gold)'; btn.style.color = 'var(--gold)'; }
  const lbl = document.getElementById('bp-selType');
  if (lbl) lbl.innerHTML = `<span style="color:var(--gold);font-weight:700">${name}</span> — อัตราจ่าย ×${parseFloat(rate).toFixed(0)} บาท`;
}

function addBuyItem() {
  if (!DS.selectedBetType) return toast('กรุณาเลือกประเภทแทง', 'warn');
  const num = document.getElementById('bp-num').value.trim();
  const amt = parseFloat(document.getElementById('bp-amt').value);
  if (!num) return toast('กรุณากรอกเลข', 'warn');
  if (!amt || amt < 1) return toast('จำนวนขั้นต่ำ ฿1', 'warn');
  DS.buyItems.push({ number:num, bet_type_id:DS.selectedBetType.id, bet_type_name:DS.selectedBetType.name, payout_rate:DS.selectedBetType.rate, amount:amt });
  document.getElementById('bp-num').value = '';
  document.getElementById('bp-amt').value = '';
  document.getElementById('bp-num').focus();
  renderBuyList();
}

function removeBuyItem(i) { DS.buyItems.splice(i, 1); renderBuyList(); }

function renderBuyList() {
  const el = document.getElementById('bp-list');
  if (!el) return;
  const total = DS.buyItems.reduce((a, x) => a + x.amount, 0);
  document.getElementById('bp-total').textContent = fmtNum(total);
  if (!DS.buyItems.length) {
    el.innerHTML = '<div style="text-align:center;color:var(--text3);font-size:12px;padding:16px">ยังไม่มีรายการ</div>';
    return;
  }
  el.innerHTML = DS.buyItems.map((item, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <span class="result-big" style="font-size:16px;color:var(--text);min-width:60px">${item.number}</span>
      <span style="font-size:11px;color:var(--text3);flex:1">${item.bet_type_name} ×${parseFloat(item.payout_rate).toFixed(0)}</span>
      <span style="font-size:13px;font-weight:700;color:var(--gold)">฿${item.amount}</span>
      <button onclick="removeBuyItem(${i})" style="width:22px;height:22px;border-radius:5px;background:rgba(231,76,60,.1);border:1px solid rgba(231,76,60,.2);color:var(--red);font-size:11px;cursor:pointer">✕</button>
    </div>`).join('');
}

async function confirmBuy() {
  if (!DS.buyItems.length) return toast('กรุณาเพิ่มรายการก่อน', 'warn');
  try {
    const res = await Slips.create({
      round_id: DS.buyRound.id,
      items: DS.buyItems.map(x => ({ bet_type_id:x.bet_type_id, number:x.number, amount:x.amount })),
    });
    closeBuyPanel();
    DS.buyItems = [];
    await loadWallet();
    toast('✅ ซื้อสำเร็จ! โพย ' + res.slip_no, 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

// ── RESULT PAGE ───────────────────────────────────────────────
let resultFilter = 'all';
async function renderResultPage() {
  buildResultTabs();
  await loadResults();
}

function buildResultTabs() {
  const wrap = document.getElementById('resultTypeTabs');
  if (!wrap) return;
  const types = [
    { k:'all', l:'ทั้งหมด' }, { k:'gov', l:'🇹🇭 รัฐบาล' },
    { k:'yeekee', l:'⚡ ยี่กี' }, { k:'set', l:'📈 หุ้น' }, { k:'hanoi', l:'🌏 ฮานอย' },
  ];
  wrap.innerHTML = types.map(t => {
    const on = t.k === resultFilter;
    return `<button onclick="resultFilter='${t.k}';buildResultTabs();loadResults()"
      style="padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;
             background:${on ? 'linear-gradient(135deg,var(--gold),var(--gold2))' : 'var(--bg3)'};
             border:${on ? '2px solid var(--gold)' : '1px solid var(--border2)'};
             color:${on ? 'var(--bg)' : 'var(--text2)'}">
      ${t.l}
    </button>`;
  }).join('');
}

async function loadResults() {
  const el = document.getElementById('resultGrid');
  if (!el) return;
  el.innerHTML = '<div style="grid-column:1/-1;color:var(--text3);padding:24px;text-align:center">⏳ กำลังโหลด...</div>';
  try {
    const q = { limit: 20 };
    if (resultFilter !== 'all') q.lottery_type = resultFilter;
    const res = await Lottery.results(q);
    if (!res.data?.length) { el.innerHTML = '<div style="grid-column:1/-1;color:var(--text3);text-align:center;padding:40px">ยังไม่มีผลรางวัล</div>'; return; }
    el.innerHTML = res.data.map(r => `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <div>
            <div style="font-size:14px;font-weight:900;color:var(--gold)">${r.lottery_name}</div>
            <div style="font-size:11px;color:var(--text3)">${r.round_code}</div>
          </div>
          <span class="badge badge-success">✅ ออกผล</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
          <div style="background:var(--bg3);border-radius:10px;padding:12px;text-align:center">
            <div style="font-size:10px;color:var(--text3);margin-bottom:6px">🏆 รางวัลที่ 1</div>
            <div class="result-big" style="font-size:22px;color:var(--gold)">${r.result_first || '——'}</div>
          </div>
          <div style="background:var(--bg3);border-radius:10px;padding:12px;text-align:center">
            <div style="font-size:10px;color:var(--text3);margin-bottom:6px">2 ตัวท้าย</div>
            <div class="result-big" style="font-size:22px;color:var(--blue)">${r.result_2_back || '--'}</div>
          </div>
          <div style="background:var(--bg3);border-radius:10px;padding:12px;text-align:center">
            <div style="font-size:10px;color:var(--text3);margin-bottom:6px">3 ตัวท้าย</div>
            <div class="result-big" style="font-size:18px;color:#FF8A5A">${r.result_3_back1 || '---'}</div>
          </div>
        </div>
        ${r.result_3_front1 ? `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">
          <div style="background:var(--bg3);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:10px;color:var(--text3);margin-bottom:4px">3 ตัวหน้า 1</div>
            <div class="result-big" style="font-size:16px;color:var(--text2)">${r.result_3_front1}</div>
          </div>
          <div style="background:var(--bg3);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:10px;color:var(--text3);margin-bottom:4px">3 ตัวท้าย 2</div>
            <div class="result-big" style="font-size:16px;color:var(--text2)">${r.result_3_back2 || '---'}</div>
          </div>
        </div>` : ''}
      </div>`).join('');
  } catch { el.innerHTML = '<div style="grid-column:1/-1;color:var(--red);text-align:center;padding:24px">โหลดไม่ได้</div>'; }
}

async function checkNumber() {
  const num  = (document.getElementById('chkNum')?.value || '').trim();
  const type = document.getElementById('chkType')?.value || '';
  const el   = document.getElementById('chkResult');
  if (!el || !num) { toast('กรุณากรอกเลขที่ต้องการตรวจ', 'warn'); return; }
  el.innerHTML = '<div style="color:var(--text3);font-size:12px">⏳ กำลังตรวจ...</div>';
  try {
    const q = { limit: 10 };
    if (type) q.lottery_type = type;
    const res = await Lottery.results(q);
    const matches = [];
    (res.data || []).forEach(r => {
      [
        { field:'รางวัลที่ 1', val:r.result_first, rate:750 },
        { field:'3 ตัวท้าย',  val:r.result_3_back1, rate:450 },
        { field:'2 ตัวท้าย',  val:r.result_2_back, rate:75 },
        { field:'3 ตัวหน้า',  val:r.result_3_front1, rate:550 },
      ].forEach(c => {
        if (!c.val) return;
        if (c.val === num || c.val.endsWith(num) || c.val.slice(-2) === num || c.val.slice(-3) === num)
          matches.push({ ...c, round:r.round_code, lotto:r.lottery_name });
      });
    });
    if (matches.length) {
      el.innerHTML = `<div style="background:rgba(46,204,113,.06);border:1px solid rgba(46,204,113,.2);border-radius:10px;padding:14px;margin-top:8px">
        <div style="font-size:13px;font-weight:700;color:var(--green);margin-bottom:10px">🏆 ถูกรางวัล!</div>
        ${matches.map(m => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
          <span style="color:var(--text2)">${m.lotto} — ${m.round} <span style="color:var(--text3)">${m.field}</span></span>
          <span style="font-weight:700;color:var(--gold)">×${m.rate}</span>
        </div>`).join('')}
      </div>`;
    } else {
      el.innerHTML = `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px;margin-top:8px;text-align:center;color:var(--text3);font-size:12px">
        เลข <span class="result-big" style="font-size:14px;color:var(--text)">${num}</span> ไม่ถูกรางวัลในงวดล่าสุด
      </div>`;
    }
  } catch { el.innerHTML = '<div style="color:var(--red);font-size:12px;margin-top:8px">ตรวจไม่ได้</div>'; }
}

// ── SLIPS PAGE ────────────────────────────────────────────────
async function renderSlipsPage() {
  const tbody = document.getElementById('slipsBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:32px">⏳ กำลังโหลด...</td></tr>';
  try {
    const res = await Slips.list({ limit: 50 });
    DS.mySlips = res.data || [];
    if (!DS.mySlips.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:40px">ยังไม่มีโพย</td></tr>';
      return;
    }
    const stMap = {
      active:    '<span class="badge badge-pending">● รับแทงอยู่</span>',
      won:       '<span class="badge badge-success">🏆 ถูกรางวัล</span>',
      lost:      '<span class="badge" style="background:var(--bg3);color:var(--text3);border:1px solid var(--border)">ไม่ถูก</span>',
      cancelled: '<span class="badge badge-fail">✕ ยกเลิก</span>',
      closed:    '<span class="badge badge-info">⏰ ปิดรับ</span>',
    };
    tbody.innerHTML = DS.mySlips.map(s => {
      const win = parseFloat(s.total_payout || 0);
      const items = (s.items || []).map(it => `${it.number}(${it.bet_type_name||''})`).join(', ');
      const canCancel = s.status === 'active' && new Date(s.close_at) - Date.now() > 0;
      return `<tr>
        <td><span class="result-big" style="font-size:11px;color:var(--text3)">${s.slip_no}</span></td>
        <td><div style="font-weight:600;color:var(--text)">${s.lottery_name||''}</div><div style="font-size:11px;color:var(--text3)">${s.round_code||''}</div></td>
        <td style="font-size:11px;color:var(--text3);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${items || '-'}</td>
        <td style="font-weight:700;color:var(--gold)">฿${fmtNum(s.total_amount)}</td>
        <td>${stMap[s.status] || s.status}</td>
        <td style="font-weight:700;color:${win > 0 ? 'var(--green)' : 'var(--text3)'}">${win > 0 ? '+฿'+fmtNum(win) : '—'}</td>
        <td>${canCancel ? `<button onclick="cancelSlip(${s.id},'${s.slip_no}',${s.total_amount})" style="padding:4px 10px;border-radius:6px;background:rgba(231,76,60,.1);border:1px solid rgba(231,76,60,.3);color:var(--red);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">ยกเลิก</button>` : ''}</td>
      </tr>`;
    }).join('');
  } catch { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--red);padding:32px">โหลดไม่ได้</td></tr>'; }
}

async function cancelSlip(id, slipNo, amount) {
  if (!confirm(`ยืนยันยกเลิกโพย ${slipNo}?\nเงินจะคืนเข้ากระเป๋า ฿${fmtNum(amount)}`)) return;
  try {
    await Slips.cancel(id);
    toast(`✅ ยกเลิกโพย ${slipNo} แล้ว`, 'ok');
    await loadWallet();
    renderSlipsPage();
  } catch (e) { toast(e.message, 'err'); }
}

// ── WALLET PAGE ───────────────────────────────────────────────
async function renderWalletPage() {
  await loadWallet();
  if (DS.wallet) {
    document.getElementById('w-bal').textContent    = fmtNum(DS.wallet.balance);
    document.getElementById('w-bonus').textContent  = fmtNum(DS.wallet.bonus_balance || 0);
    document.getElementById('w-totdep').textContent = '฿' + fmtNum(DS.wallet.total_deposit || 0);
    document.getElementById('w-totwit').textContent = '฿' + fmtNum(DS.wallet.total_withdraw || 0);
    document.getElementById('w-totbet').textContent = '฿' + fmtNum(DS.wallet.total_bet || 0);
    document.getElementById('w-totwon').textContent = '฿' + fmtNum(DS.wallet.total_won || 0);
  }
  loadTransactions();
}

async function loadTransactions() {
  const tbody = document.getElementById('txBody');
  if (!tbody) return;
  const type = document.getElementById('txFilter')?.value || '';
  try {
    const res = await Wallet.transactions({ limit: 30, type: type || undefined });
    const txs = res.data || [];
    if (!txs.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:32px">ไม่มีธุรกรรม</td></tr>'; return; }
    const TX = {
      deposit:  { lbl:'ฝากเงิน',   cls:'badge-success' },
      withdraw: { lbl:'ถอนเงิน',   cls:'badge-fail' },
      bet:      { lbl:'ซื้อหวย',   cls:'badge-info' },
      win:      { lbl:'ได้รางวัล', cls:'badge-success' },
      bonus:    { lbl:'โบนัส',     cls:'badge-success' },
      refund:   { lbl:'คืนเงิน',   cls:'badge-info' },
    };
    tbody.innerHTML = txs.map(tx => {
      const m   = TX[tx.type] || { lbl:tx.type, cls:'badge-info' };
      const pos = ['deposit','win','bonus','commission','refund'].includes(tx.type);
      const st  = { success:'<span class="badge badge-success">สำเร็จ</span>', pending:'<span class="badge badge-pending">รอ</span>', failed:'<span class="badge badge-fail">ล้มเหลว</span>' };
      return `<tr>
        <td><span class="result-big" style="font-size:10px;color:var(--text3)">${tx.ref_no}</span></td>
        <td><span class="badge ${m.cls}">${m.lbl}</span></td>
        <td style="font-weight:700;color:${pos?'var(--green)':'var(--red)'}">
          ${pos?'+':'-'}฿${fmtNum(tx.amount)}
        </td>
        <td style="color:var(--text2)">฿${fmtNum(tx.balance_after || 0)}</td>
        <td style="font-size:11px;color:var(--text3)">${fmtDate(tx.created_at)}</td>
        <td>${st[tx.status] || tx.status}</td>
      </tr>`;
    }).join('');
  } catch { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--red);padding:32px">โหลดไม่ได้</td></tr>'; }
}

// ── PROMO PAGE ────────────────────────────────────────────────
async function renderPromoPage() {
  const el = document.getElementById('promoGrid');
  if (!el) return;
  el.innerHTML = '<div style="grid-column:1/-1;color:var(--text3);padding:24px">⏳ กำลังโหลด...</div>';
  try {
    const res = await Promos.list();
    const promos = res.data || [];
    if (!promos.length) { el.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text3);padding:40px">ไม่มีโปรโมชั่น</div>'; return; }
    const TC = { bonus:{c:'var(--gold)',bg:'#1A1200',bd:'#B8860B'}, cashback:{c:'var(--green)',bg:'#0a1a0a',bd:'#3BD441'}, referral:{c:'#FF8A5A',bg:'#1a0800',bd:'#D85A30'}, special:{c:'var(--blue)',bg:'#0D0D1A',bd:'#5B9CF6'} };
    el.innerHTML = promos.map(p => {
      const m = TC[p.type] || TC.special;
      return `
      <div class="card" style="background:${m.bg};border-color:${m.bd}44">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
          <div style="font-size:30px">${p.icon||'🎁'}</div>
          <span class="badge" style="background:${m.bd}22;color:${m.c};border:1px solid ${m.bd}55">${p.type}</span>
        </div>
        <div style="font-size:15px;font-weight:900;color:${m.c};margin-bottom:6px">${p.name}</div>
        <div style="font-size:12px;color:var(--text3);margin-bottom:10px;line-height:1.5">${p.description||''}</div>
        <div style="font-size:22px;font-weight:900;color:var(--green);margin-bottom:6px">${p.value}</div>
        <div style="font-size:10px;color:var(--text3);margin-bottom:12px">⏰ ${p.end_at ? new Date(p.end_at).toLocaleDateString('th-TH') : 'ไม่มีวันหมดอายุ'}</div>
        <button onclick="claimPromo(${p.id},this)" style="width:100%;height:36px;border-radius:8px;background:linear-gradient(135deg,var(--gold),var(--gold2));border:none;color:var(--bg);font-size:13px;font-weight:900;cursor:pointer;font-family:inherit">รับสิทธิ์ →</button>
      </div>`;
    }).join('');
  } catch { el.innerHTML = '<div style="grid-column:1/-1;color:var(--red);text-align:center;padding:24px">โหลดไม่ได้</div>'; }
}

async function claimPromo(id, btn) {
  btn.textContent = '⏳...'; btn.disabled = true;
  try {
    const res = await Promos.claim(id);
    btn.textContent = '✅ รับแล้ว'; btn.style.background = 'rgba(46,204,113,.1)'; btn.style.color = 'var(--green)'; btn.style.border = '1px solid rgba(46,204,113,.3)';
    toast(`✅ รับโปรโมชั่นแล้ว! +฿${fmtNum(res.amount_received||0)}`, 'ok');
    await loadWallet();
  } catch (e) {
    btn.textContent = e.code === 'ALREADY_CLAIMED' ? '✓ รับแล้ว' : 'รับสิทธิ์ →';
    btn.disabled = false;
    toast(e.code === 'ALREADY_CLAIMED' ? 'ได้รับโปรโมชั่นนี้แล้ว' : e.message, 'warn');
  }
}

// ── AGENT PAGE ────────────────────────────────────────────────
async function renderAgentPage() {
  const el = document.getElementById('agentContent');
  if (!DS.user || !['agent','sub_agent','admin','superadmin'].includes(DS.user.role)) {
    el.innerHTML = '<div style="text-align:center;color:var(--text3);padding:60px">หน้านี้สำหรับตัวแทน (Agent) เท่านั้น</div>';
    return;
  }
  try {
    const d = await Agent.dashboard();
    el.innerHTML = `
    <div class="grid-4" style="margin-bottom:20px">
      <div class="kpi-card kpi-gold"><div class="kpi-label">Commission เดือนนี้</div><div class="kpi-value" style="color:var(--gold)">฿${fmtNum(d.commission_this_month||0)}</div></div>
      <div class="kpi-card kpi-green"><div class="kpi-label">สมาชิกในทีม</div><div class="kpi-value" style="color:var(--green)">${d.member_count||0}</div></div>
      <div class="kpi-card kpi-blue"><div class="kpi-label">ยอดทีมเดือนนี้</div><div class="kpi-value" style="color:var(--blue)">฿${fmtNum(d.team_bet_volume||0)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Commission รวม</div><div class="kpi-value" style="color:var(--gold2)">฿${fmtNum(d.total_commission||0)}</div></div>
    </div>
    <div class="card" style="max-width:400px">
      <div class="card-title">รหัสตัวแทน</div>
      <div class="result-big" style="font-size:24px;color:var(--gold);margin-bottom:14px">${d.agent_code||'-'}</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:4px">อัตราค่าคอมมิชชั่น</div>
      <div style="font-size:13px;color:var(--text2)">L1: ${((d.commission_l1||0)*100).toFixed(1)}% &nbsp;|&nbsp; L2: ${((d.commission_l2||0)*100).toFixed(1)}% &nbsp;|&nbsp; L3: ${((d.commission_l3||0)*100).toFixed(1)}%</div>
    </div>`;
  } catch (e) { el.innerHTML = '<div style="color:var(--red);padding:20px">โหลดไม่ได้: ' + e.message + '</div>'; }
}

// ── PROFILE PAGE ──────────────────────────────────────────────
async function renderProfilePage() {
  const u = DS.user;
  if (!u) return;
  document.getElementById('pro-avatar').textContent = (u.first_name || '?').charAt(0);
  document.getElementById('pro-name').textContent   = u.first_name + ' ' + u.last_name;
  document.getElementById('pro-phone').textContent  = u.phone || '';
  const VIP = { bronze:'🥉 Bronze', silver:'🥈 Silver', gold:'⭐ Gold', platinum:'💎 Platinum', diamond:'👑 Diamond' };
  document.getElementById('pro-vip').textContent    = VIP[u.vip_tier] || '⭐ Bronze';
  if (DS.wallet) {
    document.getElementById('pro-stats').innerHTML = `
    <div class="grid-2" style="gap:12px;align-content:start">
      <div class="card"><div class="card-title">ยอดเงิน</div><div style="font-size:28px;font-weight:900;color:var(--gold)">฿${fmtNum(DS.wallet.balance)}</div></div>
      <div class="card"><div class="card-title">รางวัลรวม</div><div style="font-size:28px;font-weight:900;color:var(--green)">฿${fmtNum(DS.wallet.total_won||0)}</div></div>
      <div class="card"><div class="card-title">ฝากรวม</div><div style="font-size:24px;font-weight:900;color:var(--text)">฿${fmtNum(DS.wallet.total_deposit||0)}</div></div>
      <div class="card"><div class="card-title">แทงรวม</div><div style="font-size:24px;font-weight:900;color:var(--text)">฿${fmtNum(DS.wallet.total_bet||0)}</div></div>
    </div>`;
  }
}

// ── NOTIFICATIONS ─────────────────────────────────────────────
let notifOpen = false;
function toggleNotif() {
  notifOpen = !notifOpen;
  document.getElementById('notifDrop').classList.toggle('open', notifOpen);
  if (notifOpen) loadNotifList();
}

async function loadNotifBadge() {
  try {
    const res = await Notif.list({ is_read: 0, limit: 1 });
    const c = res.unread_count || 0;
    const b = document.getElementById('notifBadge');
    const t = document.getElementById('topNotifCount');
    if (b) { b.textContent = c; b.style.display = c > 0 ? 'block' : 'none'; }
    if (t) { t.textContent = c > 0 ? c : ''; t.style.display = c > 0 ? 'inline' : 'none'; }
  } catch {}
}

let notifFilterD = 'all';
async function loadNotifList() {
  const el = document.getElementById('notifList');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:12px">⏳ กำลังโหลด...</div>';
  try {
    const q = {};
    if (notifFilterD === '0') q.is_read = 0;
    const res = await Notif.list(q);
    const items = res.data || [];
    if (!items.length) { el.innerHTML = '<div style="text-align:center;color:var(--text3);padding:40px">ไม่มีการแจ้งเตือน</div>'; return; }
    const NMETA = { win:{icon:'🏆',bg:'rgba(255,215,0,.06)',bc:'rgba(255,215,0,.15)'}, deposit:{icon:'💰',bg:'rgba(46,204,113,.05)',bc:'rgba(46,204,113,.15)'}, system:{icon:'⚙️',bg:'var(--bg3)',bc:'var(--border)'} };
    el.innerHTML = items.map(n => {
      const m = NMETA[n.type] || NMETA.system;
      return `
      <div onclick="readNotif(${n.id},this)" style="background:${n.is_read ? 'transparent' : m.bg};border:1px solid ${n.is_read ? 'transparent' : m.bc};border-radius:10px;padding:12px;margin-bottom:6px;cursor:pointer;display:flex;gap:10px;transition:.15s">
        <div style="width:34px;height:34px;border-radius:8px;background:var(--bg3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${m.icon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:${n.is_read ? 500 : 700};color:${n.is_read ? 'var(--text2)' : 'var(--text)'};margin-bottom:3px">${n.title}</div>
          <div style="font-size:11px;color:var(--text3);line-height:1.4">${n.body}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:4px">${fmtDate(n.created_at)}</div>
        </div>
        ${!n.is_read ? '<div style="width:7px;height:7px;border-radius:50%;background:var(--gold);flex-shrink:0;margin-top:5px"></div>' : ''}
      </div>`;
    }).join('');
  } catch { el.innerHTML = '<div style="color:var(--red);font-size:12px;padding:12px">โหลดไม่ได้</div>'; }
}

async function readNotif(id, el) {
  try { await Notif.read(id); el.style.background = 'transparent'; el.style.border = '1px solid transparent'; const dot = el.querySelector('div:last-child'); if (dot?.style.borderRadius) dot.remove(); loadNotifBadge(); } catch {}
}

async function markAllRead() {
  try { await Notif.readAll(); toast('✅ อ่านทั้งหมดแล้ว', 'ok'); loadNotifList(); loadNotifBadge(); } catch (e) { toast(e.message, 'err'); }
}

// ── DEPOSIT ───────────────────────────────────────────────────
function openDepositModal() { document.getElementById('depositModal').classList.add('open'); }
function closeDepositModal() { document.getElementById('depositModal').classList.remove('open'); }
function openWithdrawModal() { toast('กรุณาเพิ่มบัญชีธนาคารในหน้าโปรไฟล์ก่อน', 'warn'); }

function selDepMethod(method, domId) {
  DS.depositMethod = method;
  document.querySelectorAll('.dep-method').forEach(el => el.classList.remove('sel'));
  document.getElementById(domId).classList.add('sel');
}

async function doDeposit() {
  const amount = parseFloat(document.getElementById('dep-amount').value);
  if (!amount || amount < 100) return toast('ฝากขั้นต่ำ ฿100', 'warn');
  try {
    await Wallet.deposit({ amount, payment_method: DS.depositMethod });
    closeDepositModal();
    toast('✅ ส่งคำขอฝากเงินแล้ว รอการยืนยัน 5-15 นาที', 'ok');
    await loadWallet();
  } catch (e) { toast(e.message, 'err'); }
}

// ── UTILS ─────────────────────────────────────────────────────
function fmtNum(n) { return parseFloat(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function fmtDate(d) { return new Date(d).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'2-digit', hour:'2-digit', minute:'2-digit' }); }

let _toastT;
function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast on ${type}`;
  clearTimeout(_toastT);
  _toastT = setTimeout(() => el.classList.remove('on'), 3000);
}

// ── Layout switch ─────────────────────────────────────────────
function switchToMobile() {
  document.cookie = 'tgl_layout=mobile;path=/;max-age=86400';
  window.location.replace('/');
}
