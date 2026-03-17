/**
 * TigerLotto — Frontend App
 * SPA logic เชื่อมกับ Backend API ทุก action
 */

// ── State ─────────────────────────────────────────────────────
let STATE = {
  user:       null,
  wallet:     null,
  tab:        0,          // 0=home,1=buy,2=result,3=wallet,4=profile
  lotteryTypes: [],
  rounds:     [],
  mySlips:    [],
  transactions: [],
  buyRound:   null,
  buyItems:   [],         // [{number,bet_type_id,bet_type_name,payout_rate,amount}]
  cancelTarget: null,
  cdIntervals: {},
};

const TABS = [
  { icon:'🏠', label:'หน้าหลัก', key:'home'    },
  { icon:'🎟', label:'ซื้อหวย',  key:'buy'     },
  { icon:'📊', label:'ตรวจผล',   key:'result'  },
  { icon:'💰', label:'กระเป๋า',  key:'wallet'  },
  { icon:'👤', label:'โปรไฟล์', key:'profile' },
  { icon:'🎁', label:'โปรโมชั่น',key:'promo',  hidden:true },
  { icon:'🔔', label:'แจ้งเตือน',key:'notif',  hidden:true },
  { icon:'🎯', label:'Agent',    key:'agent',  hidden:true },
];

// ── Init ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  // Hide loading after 1.5s
  setTimeout(() => {
    document.getElementById('loading').classList.add('hide');
  }, 1500);

  buildBottomNav();
  buildNavLinks();

  if (isLoggedIn()) {
    const { user } = getSession();
    STATE.user = user;
    showApp();
    await Promise.all([loadWallet(), loadLotteryTypes()]);
    renderHome();
  } else {
    showAuth();
  }
});

// ── Auth Pages ────────────────────────────────────────────────
function showAuth() {
  document.getElementById('pg-auth').classList.add('active');
  document.getElementById('pg-app').classList.remove('active');
}
function showApp() {
  document.getElementById('pg-auth').classList.remove('active');
  document.getElementById('pg-app').classList.add('active');
  updateNavUser();
  setTab(0);
}

function authMode(mode) {
  document.getElementById('form-login').style.display = mode === 'login' ? 'block' : 'none';
  document.getElementById('form-reg').style.display   = mode === 'register' ? 'block' : 'none';
  document.getElementById('tab-login').classList.toggle('on', mode === 'login');
  document.getElementById('tab-reg').classList.toggle('on',   mode === 'register');
}

async function doLogin() {
  const phone    = document.getElementById('login-phone').value.trim();
  const password = document.getElementById('login-pass').value;
  if (!phone || !password) return toast('กรุณากรอกเบอร์และรหัสผ่าน', 'warn');
  const btn = document.getElementById('btn-login');
  btn.textContent = '⏳ กำลังเข้าสู่ระบบ...'; btn.disabled = true;
  try {
    const res = await Auth.login({ phone, password });
    saveSession(res.token, res.user);
    STATE.user = res.user;
    showApp();
    await Promise.all([loadWallet(), loadLotteryTypes()]);
    renderHome();
    toast('✅ ยินดีต้อนรับ ' + res.user.first_name + ' ครับ');
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    btn.textContent = '🐯 เข้าสู่ระบบ'; btn.disabled = false;
  }
}

async function doRegister() {
  const first_name    = document.getElementById('reg-fname').value.trim();
  const last_name     = document.getElementById('reg-lname').value.trim();
  const phone         = document.getElementById('reg-phone').value.trim();
  const password      = document.getElementById('reg-pass').value;
  const referral_code = document.getElementById('reg-ref').value.trim();
  if (!first_name || !last_name || !phone || !password)
    return toast('กรุณากรอกข้อมูลให้ครบ', 'warn');
  try {
    const res = await Auth.register({ first_name, last_name, phone, password, referral_code });
    saveSession(res.token, res.user);
    STATE.user = res.user;
    showApp();
    await Promise.all([loadWallet(), loadLotteryTypes()]);
    renderHome();
    toast('🎉 สมัครสำเร็จ! รับโบนัส ฿50 แล้ว');
  } catch (e) {
    toast(e.message, 'err');
  }
}

function doLogout() {
  clearSession();
  STATE = { user:null, wallet:null, tab:0, lotteryTypes:[], rounds:[], mySlips:[], transactions:[], buyRound:null, buyItems:[], cancelTarget:null, cdIntervals:{} };
  showAuth();
  toast('ออกจากระบบแล้ว');
}

// ── Nav ───────────────────────────────────────────────────────
function buildBottomNav() {
  const nav = document.getElementById('bottomNav');
  nav.innerHTML = TABS.map((t, i) => `
    <div class="bn" id="bn-${i}" onclick="setTab(${i})">
      <div class="bn-ico">${t.icon}</div>
      <div class="bn-lbl">${t.label}</div>
    </div>`).join('');
}

function buildNavLinks() {
  // ไม่แสดง nav links บน mobile — ใช้ bottom nav แทน
}

function setTab(i) {
  STATE.tab = i;
  TABS.forEach((t, idx) => {
    const tabEl = document.getElementById('tab-' + t.key);
    if (tabEl) tabEl.style.display = idx === i ? 'block' : 'none';
    const bnEl = document.getElementById('bn-' + idx);
    if (bnEl) bnEl.classList.toggle('on', idx === i);
  });
  const key = TABS[i]?.key;
  if (key === 'home')    renderHome();
  if (key === 'buy')     renderBuy();
  if (key === 'result')  renderResults();
  if (key === 'wallet')  renderWallet();
  if (key === 'profile') renderProfile();
  if (key === 'promo')   renderPromos();
  if (key === 'notif')   renderNotifications();
  if (key === 'agent')   renderAgentPortal();
}

function updateNavUser() {
  if (!STATE.user) return;
  const initials = (STATE.user.first_name || '?').charAt(0);
  document.getElementById('navAv').textContent = initials;
  if (STATE.wallet) {
    document.getElementById('navBal').textContent =
      '💰 ฿' + parseFloat(STATE.wallet.balance || 0).toLocaleString();
  }
}

// ── Data Loaders ──────────────────────────────────────────────
async function loadWallet() {
  try {
    STATE.wallet = await Wallet.get();
    updateNavUser();
  } catch {}
}

async function loadLotteryTypes() {
  try {
    const res = await Lottery.types();
    STATE.lotteryTypes = res.data || [];
  } catch {}
}

async function loadRounds(status = 'open') {
  try {
    const res = await Lottery.rounds({ status });
    STATE.rounds = res.data || [];
  } catch { STATE.rounds = []; }
}

// ── HOME ──────────────────────────────────────────────────────
async function renderHome() {
  renderLottoGrid();
  await loadRecentResults();
}

function renderLottoGrid() {
  const grid = document.getElementById('lottoGrid');
  if (!grid) return;

  const TYPE_META = {
    gov:    { icon:'🇹🇭', rate:'฿750', color:'#1A1200', border:'#B8860B55', sub:'งวด 16 มี.ค.' },
    yeekee: { icon:'⚡', rate:'฿700', color:'#0a1a0a', border:'#3BD44133', sub:'90 รอบ/วัน' },
    set:    { icon:'📈', rate:'฿680', color:'#0a0a1a', border:'#378ADD33', sub:'เช้า/บ่าย' },
    hanoi:  { icon:'🌏', rate:'฿650', color:'#1a0a00', border:'#D85A3033', sub:'ทุกวัน' },
    laos:   { icon:'🇱🇦', rate:'฿620', color:'#111',   border:'#1e1e1e',   sub:'ทุกวัน' },
  };

  const types = STATE.lotteryTypes.length ? STATE.lotteryTypes : [
    { id:1, code:'gov',    name:'หวยรัฐบาล' },
    { id:2, code:'yeekee', name:'ยี่กี 24ชม.' },
    { id:3, code:'set',    name:'หุ้น SET' },
    { id:4, code:'hanoi',  name:'ฮานอย' },
  ];

  grid.innerHTML = types.slice(0,4).map(lt => {
    const m = TYPE_META[lt.code] || { icon:'🎯', rate:'฿700', color:'#111', border:'#1e1e1e', sub:'' };
    return `
    <div class="lotto-card" onclick="selectLotteryType('${lt.id}','${lt.code}')"
      style="border-color:${m.border};background:linear-gradient(135deg,${m.color},${m.color}88)">
      <div style="font-size:28px;margin-bottom:6px">${m.icon}</div>
      <div class="lotto-card-name">${lt.name}</div>
      <div class="lotto-card-rate">${m.rate}</div>
      <div style="font-size:10px;font-weight:700;color:var(--green)">3 ตัวบน</div>
      <div class="lotto-card-time">⏰ ${m.sub}</div>
    </div>`;
  }).join('');
}

async function loadRecentResults() {
  const el = document.getElementById('recentResults');
  if (!el) return;
  el.innerHTML = '<div style="color:#444;font-size:12px;padding:8px 0">⏳ กำลังโหลด...</div>';
  try {
    const res = await Lottery.results({ limit: 5 });
    const results = res.data || [];
    if (!results.length) {
      el.innerHTML = '<div class="empty"><div class="empty-ico">📊</div><div>ยังไม่มีผลรางวัล</div></div>';
      return;
    }
    el.innerHTML = results.map(r => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #111">
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--gold)">${r.lottery_name}</div>
          <div style="font-size:10px;color:#555">${r.round_code}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:16px;font-weight:900;color:#fff;font-family:'JetBrains Mono',monospace">${r.result_first || '——'}</div>
          <div style="font-size:10px;color:#888">2ท้าย: ${r.result_2_back || '--'}</div>
        </div>
      </div>`).join('');
  } catch {
    el.innerHTML = '<div style="color:#555;font-size:12px;padding:8px 0">โหลดผลรางวัลไม่ได้</div>';
  }
}

// ── BUY ───────────────────────────────────────────────────────
async function renderBuy() {
  await loadRounds('open');
  const el = document.getElementById('buyRounds');
  if (!el) return;

  if (!STATE.rounds.length) {
    el.innerHTML = '<div class="empty"><div class="empty-ico">🎟</div><div style="font-size:13px;font-weight:700;color:#555;margin-bottom:6px">ไม่มีงวดที่เปิดรับ</div><div style="font-size:12px;color:#444">กรุณารอเปิดรับในงวดถัดไป</div></div>';
    return;
  }

  el.innerHTML = STATE.rounds.map(r => {
    const tl = new Date(r.close_at) - Date.now();
    const mins = Math.floor(tl / 60000);
    const secs = Math.floor((tl % 60000) / 1000);
    const cdClass = tl < 5*60*1000 ? 'cd-hot' : tl < 15*60*1000 ? 'cd-warn' : 'cd-ok';
    const dotColor = tl < 5*60*1000 ? '#FF8A5A' : tl < 15*60*1000 ? '#FFD700' : '#3BD441';
    return `
    <div class="card" style="cursor:pointer;transition:border-color .2s"
      onmouseenter="this.style.borderColor='#B8860B55'" onmouseleave="this.style.borderColor='#1e1e1e'"
      onclick="openBuySlip('${r.id}','${r.name || r.round_code}')">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:44px;height:44px;border-radius:11px;background:#1A1200;border:1px solid #B8860B33;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${r.icon || '🎯'}</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:900;color:var(--gold)">${r.name || r.round_code}</div>
          <span class="cd ${cdClass}" id="cd-round-${r.id}">
            <span class="cd-dot" style="background:${dotColor}"></span>
            ปิดรับใน ${tl > 0 ? `${mins}:${String(secs).padStart(2,'0')}` : 'ปิดแล้ว'}
          </span>
        </div>
        <div style="text-align:right">
          <div style="font-size:13px;font-weight:900;color:var(--gold)">฿${parseFloat(r.total_bet_amount||0).toLocaleString()}</div>
          <div style="font-size:10px;color:#555">ยอดรวม</div>
        </div>
      </div>
      <button onclick="event.stopPropagation();openBuySlip('${r.id}','${r.name||r.round_code}')"
        style="width:100%;height:38px;margin-top:10px;border-radius:9px;background:linear-gradient(135deg,var(--gold),var(--gold2));border:none;color:var(--dark);font-size:13px;font-weight:900;cursor:pointer;font-family:inherit">
        🎟 ซื้อหวยงวดนี้
      </button>
    </div>`;
  }).join('');

  // Start countdown
  startCountdowns();
}

function startCountdowns() {
  clearAllCountdowns();
  STATE.rounds.forEach(r => {
    const interval = setInterval(() => {
      const el = document.getElementById(`cd-round-${r.id}`);
      if (!el) { clearInterval(interval); return; }
      const tl = new Date(r.close_at) - Date.now();
      if (tl <= 0) {
        el.className = 'cd cd-hot';
        el.innerHTML = '⏰ ปิดรับแล้ว';
        clearInterval(interval);
        return;
      }
      const m = Math.floor(tl/60000), s = Math.floor((tl%60000)/1000);
      const cls = tl < 5*60*1000 ? 'cd-hot' : tl < 15*60*1000 ? 'cd-warn' : 'cd-ok';
      const dc  = tl < 5*60*1000 ? '#FF8A5A' : tl < 15*60*1000 ? '#FFD700' : '#3BD441';
      el.className = `cd ${cls}`;
      el.innerHTML = `<span class="cd-dot" style="background:${dc}"></span>ปิดรับใน ${m}:${String(s).padStart(2,'0')}`;
    }, 1000);
    STATE.cdIntervals[r.id] = interval;
  });
}

function clearAllCountdowns() {
  Object.values(STATE.cdIntervals).forEach(clearInterval);
  STATE.cdIntervals = {};
}

async function openBuySlip(roundId, roundName) {
  const r = STATE.rounds.find(x => String(x.id) === String(roundId));
  if (!r) return;
  const tl = new Date(r.close_at) - Date.now();
  if (tl <= 0) return toast('หมดเวลารับแทงแล้ว', 'warn');

  STATE.buyRound = r;
  STATE.buyItems = [];

  // Load bet types
  try {
    const res = await Lottery.betTypes(r.lottery_type_id);
    STATE.betTypes = res.data || [];
  } catch { STATE.betTypes = []; }

  showBuyModal(roundName);
}

function showBuyModal(roundName) {
  const existing = document.getElementById('buyModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'modal-bg open';
  modal.id = 'buyModal';
  modal.innerHTML = `
  <div class="modal-box" style="max-height:90vh">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div class="modal-title">🎟 ${roundName}</div>
      <button onclick="closeModal('buyModal')" style="width:30px;height:30px;border-radius:7px;background:#1a1a1a;border:1px solid #2a2a2a;color:#888;cursor:pointer;font-size:14px">✕</button>
    </div>

    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
      ${(STATE.betTypes.slice(0,6)).map(bt => `
        <button onclick="selectBetType(${bt.id},'${bt.name}',${bt.payout_rate})"
          id="bt-${bt.id}"
          style="padding:6px 12px;border-radius:10px;background:#1A1200;border:1.5px solid #B8860B44;color:var(--gold);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .15s">
          ${bt.name} ×${parseFloat(bt.payout_rate).toFixed(0)}
        </button>`).join('')}
    </div>

    <div id="selectedBetType" style="font-size:11px;color:#555;margin-bottom:8px">กรุณาเลือกประเภทแทง</div>

    <div style="display:flex;gap:8px;margin-bottom:10px">
      <input id="buyNumber" placeholder="กรอกเลข" maxlength="6"
        style="flex:1;height:46px;background:var(--dark);border:2px solid #FFD70033;border-radius:10px;color:#fff;font-size:20px;font-weight:900;padding:0 12px;font-family:'JetBrains Mono',monospace;outline:none;letter-spacing:3px;text-align:center"
        oninput="this.style.borderColor=this.value?'var(--gold)':'#FFD70033'">
      <input id="buyAmount" type="number" placeholder="฿" min="1"
        style="width:90px;height:46px;background:var(--dark);border:2px solid #FFD70033;border-radius:10px;color:var(--gold);font-size:16px;font-weight:900;padding:0 10px;font-family:inherit;outline:none;text-align:center"
        oninput="this.style.borderColor=this.value?'var(--gold)':'#FFD70033'">
      <button onclick="addBuyItem()" style="width:46px;height:46px;border-radius:10px;background:linear-gradient(135deg,var(--gold),var(--gold2));border:none;color:var(--dark);font-size:20px;cursor:pointer">+</button>
    </div>

    <div id="buyList" style="max-height:160px;overflow-y:auto;margin-bottom:10px"></div>

    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-top:1px solid #1a1a1a;margin-bottom:10px">
      <span style="font-size:13px;color:#888">ยอดรวม</span>
      <span style="font-size:22px;font-weight:900;color:var(--gold)">฿<span id="buyTotal">0</span></span>
    </div>

    <button onclick="confirmBuy()"
      style="width:100%;height:48px;border-radius:12px;background:linear-gradient(135deg,var(--gold),var(--gold2));border:none;color:var(--dark);font-size:16px;font-weight:900;cursor:pointer;font-family:inherit">
      ✅ ยืนยันซื้อหวย
    </button>
  </div>`;
  document.body.appendChild(modal);

  // Auto-select first bet type
  if (STATE.betTypes.length) {
    selectBetType(STATE.betTypes[0].id, STATE.betTypes[0].name, STATE.betTypes[0].payout_rate);
  }
}

let selectedBetType = null;
function selectBetType(id, name, rate) {
  selectedBetType = { id, name, rate };
  document.querySelectorAll('[id^="bt-"]').forEach(b => {
    b.style.background = '#1A1200';
    b.style.borderColor = '#B8860B44';
    b.style.color = 'var(--gold)';
  });
  const btn = document.getElementById('bt-' + id);
  if (btn) {
    btn.style.background = 'linear-gradient(135deg,var(--gold),var(--gold2))';
    btn.style.color = '#0A0A0A';
    btn.style.borderColor = 'var(--gold)';
  }
  const lbl = document.getElementById('selectedBetType');
  if (lbl) lbl.innerHTML = `<span style="color:var(--gold);font-weight:700">${name}</span> — อัตราจ่าย ×${parseFloat(rate).toFixed(0)} บาท`;
}

function addBuyItem() {
  if (!selectedBetType) return toast('กรุณาเลือกประเภทแทงก่อน', 'warn');
  const num = document.getElementById('buyNumber').value.trim();
  const amt = parseFloat(document.getElementById('buyAmount').value);
  if (!num) return toast('กรุณากรอกเลข', 'warn');
  if (!amt || amt < 1) return toast('จำนวนขั้นต่ำ ฿1', 'warn');

  STATE.buyItems.push({
    number:        num,
    bet_type_id:   selectedBetType.id,
    bet_type_name: selectedBetType.name,
    payout_rate:   selectedBetType.rate,
    amount:        amt,
  });

  document.getElementById('buyNumber').value = '';
  document.getElementById('buyAmount').value = '';
  renderBuyList();
}

function removeBuyItem(i) {
  STATE.buyItems.splice(i, 1);
  renderBuyList();
}

function renderBuyList() {
  const el = document.getElementById('buyList');
  if (!el) return;
  const total = STATE.buyItems.reduce((a, x) => a + x.amount, 0);
  document.getElementById('buyTotal').textContent = total.toLocaleString();

  if (!STATE.buyItems.length) {
    el.innerHTML = '<div style="text-align:center;color:#444;font-size:12px;padding:10px">ยังไม่มีรายการ</div>';
    return;
  }
  el.innerHTML = STATE.buyItems.map((item, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #0f0f0f">
      <span style="font-size:18px;font-weight:900;color:#fff;font-family:'JetBrains Mono',monospace;min-width:60px;letter-spacing:2px">${item.number}</span>
      <span style="font-size:10px;color:#888;flex:1">${item.bet_type_name} ×${parseFloat(item.payout_rate).toFixed(0)}</span>
      <span style="font-size:13px;font-weight:700;color:var(--gold)">฿${item.amount}</span>
      <button onclick="removeBuyItem(${i})" style="width:24px;height:24px;border-radius:6px;background:#1a0a0a;border:1px solid #D85A3033;color:var(--red);font-size:12px;cursor:pointer">✕</button>
    </div>`).join('');
}

async function confirmBuy() {
  if (!STATE.buyItems.length) return toast('กรุณาเพิ่มรายการก่อน', 'warn');
  if (!isLoggedIn()) return toast('กรุณาเข้าสู่ระบบ', 'warn');

  try {
    const res = await Slips.create({
      round_id: STATE.buyRound.id,
      items: STATE.buyItems.map(x => ({
        bet_type_id: x.bet_type_id,
        number:      x.number,
        amount:      x.amount,
      })),
    });

    closeModal('buyModal');
    STATE.buyItems = [];
    await loadWallet();
    updateNavUser();
    toast(`✅ ซื้อหวยสำเร็จ! โพย ${res.slip_no}`);
    setTab(4); // ไปหน้าโปรไฟล์ดูโพย
  } catch (e) {
    toast(e.message, 'err');
  }
}

// ── RESULTS ───────────────────────────────────────────────────
async function renderResults() {
  const el = document.getElementById('resultList');
  if (!el) return;
  el.innerHTML = '<div style="color:#444;font-size:12px">⏳ กำลังโหลด...</div>';
  try {
    const res = await Lottery.results({ limit: 20 });
    const results = res.data || [];
    if (!results.length) {
      el.innerHTML = '<div class="empty"><div class="empty-ico">📊</div><div>ยังไม่มีผลรางวัล</div></div>';
      return;
    }
    el.innerHTML = results.map(r => `
      <div class="card" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div style="font-size:14px;font-weight:900;color:var(--gold)">${r.lottery_name}</div>
          <div style="font-size:10px;color:#555">${r.round_code}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          <div style="background:#0A0A0A;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:9px;color:#555;margin-bottom:4px">รางวัลที่ 1</div>
            <div style="font-size:22px;font-weight:900;color:var(--gold);font-family:'JetBrains Mono',monospace;letter-spacing:2px">${r.result_first || '——'}</div>
          </div>
          <div style="background:#0A0A0A;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:9px;color:#555;margin-bottom:4px">2 ตัวท้าย</div>
            <div style="font-size:22px;font-weight:900;color:#78BAFF;font-family:'JetBrains Mono',monospace">${r.result_2_back || '--'}</div>
          </div>
          <div style="background:#0A0A0A;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:9px;color:#555;margin-bottom:4px">3 ตัวท้าย</div>
            <div style="font-size:18px;font-weight:900;color:#FF8A5A;font-family:'JetBrains Mono',monospace">${r.result_3_back1 || '---'}</div>
          </div>
        </div>
      </div>`).join('');
  } catch {
    el.innerHTML = '<div style="color:var(--red);font-size:12px;padding:20px;text-align:center">โหลดผลไม่ได้</div>';
  }
}

// ── WALLET ────────────────────────────────────────────────────
async function renderWallet() {
  await loadWallet();
  if (STATE.wallet) {
    document.getElementById('walletBal').textContent   = parseFloat(STATE.wallet.balance   || 0).toLocaleString();
    document.getElementById('walletBonus').textContent = parseFloat(STATE.wallet.bonus_balance || 0).toLocaleString();
  }
  await loadTransactions();
}

async function loadTransactions() {
  const el = document.getElementById('txList');
  if (!el) return;
  try {
    const res = await Wallet.transactions({ limit: 15 });
    const txs = res.data || [];
    if (!txs.length) {
      el.innerHTML = '<div class="empty"><div class="empty-ico">💳</div><div>ยังไม่มีธุรกรรม</div></div>';
      return;
    }
    const TX_META = {
      deposit:    { icon:'📥', label:'ฝากเงิน',   cls:'pos' },
      withdraw:   { icon:'📤', label:'ถอนเงิน',    cls:'neg' },
      bet:        { icon:'🎟', label:'ซื้อหวย',    cls:'neg' },
      win:        { icon:'🏆', label:'ได้รางวัล',  cls:'pos' },
      bonus:      { icon:'🎁', label:'โบนัส',      cls:'pos' },
      commission: { icon:'💸', label:'Commission',  cls:'pos' },
      refund:     { icon:'↩️', label:'คืนเงิน',    cls:'pos' },
    };
    el.innerHTML = txs.map(tx => {
      const m = TX_META[tx.type] || { icon:'💳', label:tx.type, cls:'gold' };
      const sign = ['deposit','win','bonus','commission','refund'].includes(tx.type) ? '+' : '-';
      const statusBadge = tx.status === 'success' ? '' :
        `<span class="badge ${tx.status==='pending'?'badge-pend':'badge-fail'}">${tx.status==='pending'?'รอ':'ล้มเหลว'}</span>`;
      return `
        <div class="tx-item">
          <div class="tx-ico" style="background:#111;border:1px solid #1e1e1e">${m.icon}</div>
          <div class="tx-info">
            <div class="tx-name">${tx.note || m.label} ${statusBadge}</div>
            <div class="tx-date">${new Date(tx.created_at).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>
          </div>
          <div class="tx-amt ${m.cls}">${sign}฿${parseFloat(tx.amount).toLocaleString()}</div>
        </div>`;
    }).join('');
  } catch {
    el.innerHTML = '<div style="color:#555;font-size:12px;padding:10px">โหลดธุรกรรมไม่ได้</div>';
  }
}

function openDeposit() { document.getElementById('depositModal').classList.add('open'); }
function openWithdraw() { toast('กรุณาเพิ่มบัญชีธนาคารก่อนในหน้าโปรไฟล์', 'warn'); }

async function doDeposit() {
  const amount = parseFloat(document.getElementById('dep-amount').value);
  const payment_method = document.getElementById('dep-method').value;
  if (!amount || amount < 1) return toast('กรุณาระบุจำนวนเงิน', 'warn');
  try {
    await Wallet.deposit({ amount, payment_method });
    closeModal('depositModal');
    toast('✅ ส่งคำขอฝากเงินแล้ว รอการยืนยัน');
    await loadWallet(); updateNavUser(); renderWallet();
  } catch (e) { toast(e.message, 'err'); }
}

// ── PROFILE ───────────────────────────────────────────────────
async function renderProfile() {
  const u = STATE.user;
  if (!u) return;
  const initials = (u.first_name || '?').charAt(0);
  document.getElementById('profileAvatar').textContent = initials;
  document.getElementById('profileName').textContent   = (u.first_name || '') + ' ' + (u.last_name || '');
  document.getElementById('profilePhone').textContent  = u.phone || '';
  const vipLabels = { bronze:'🥉 Bronze', silver:'🥈 Silver', gold:'⭐ Gold', platinum:'💎 Platinum', diamond:'👑 Diamond' };
  document.getElementById('profileVip').textContent    = vipLabels[u.vip_tier] || '⭐ Bronze';

  if (STATE.wallet) {
    document.getElementById('profileStats').innerHTML = `
      <div class="stat-c"><div class="stat-v">฿${parseFloat(STATE.wallet.balance||0).toLocaleString()}</div><div class="stat-l">ยอดเงิน</div></div>
      <div class="stat-c"><div class="stat-v" style="color:var(--green)">฿${parseFloat(STATE.wallet.total_won||0).toLocaleString()}</div><div class="stat-l">รางวัลรวม</div></div>
      <div class="stat-c"><div class="stat-v" style="color:#78BAFF">${u.vip_points||0}</div><div class="stat-l">VIP Points</div></div>`;
  }
  await loadMySlips();
}

async function loadMySlips() {
  const el = document.getElementById('mySlips');
  if (!el) return;
  el.innerHTML = '<div style="color:#444;font-size:12px;padding:10px 0">⏳ กำลังโหลดโพย...</div>';
  try {
    const res = await Slips.list({ limit: 10 });
    STATE.mySlips = res.data || [];
    renderSlipList();
  } catch {
    el.innerHTML = '<div style="color:#555;font-size:12px;padding:10px 0">โหลดโพยไม่ได้</div>';
  }
}

function renderSlipList() {
  const el = document.getElementById('mySlips');
  if (!el) return;
  if (!STATE.mySlips.length) {
    el.innerHTML = '<div class="empty"><div class="empty-ico">📋</div><div style="font-size:12px;color:#555">ยังไม่มีโพย กดซื้อหวยได้เลย</div></div>';
    return;
  }
  el.innerHTML = STATE.mySlips.map(slip => {
    const tl = new Date(slip.close_at) - Date.now();
    const canCancel = slip.status === 'active' && tl > 0;
    const STATUS_MAP = {
      active:    '<span class="badge badge-ok">● รับแทงอยู่</span>',
      closed:    '<span class="badge" style="background:#111;color:#555;border:1px solid #2a2a2a">⏰ ปิดรับ</span>',
      cancelled: '<span class="badge badge-fail">✕ ยกเลิก</span>',
      won:       '<span class="badge" style="background:#1A1200;color:var(--gold);border:1px solid #B8860B55">🏆 ถูกรางวัล</span>',
      lost:      '<span class="badge" style="background:#111;color:#444;border:1px solid #1e1e1e">✕ ไม่ถูก</span>',
    };
    const winTotal = (slip.items || []).reduce((a, x) => a + parseFloat(x.win_amount || 0), 0);
    return `
    <div class="slip-card" style="opacity:${slip.status==='cancelled'?0.55:1}">
      <div class="slip-hdr" onclick="toggleSlipBody('${slip.id}')">
        <div class="slip-ico" style="background:#1A1200;border:1px solid #B8860B33">${slip.icon || '🎯'}</div>
        <div style="flex:1;min-width:0">
          <div class="slip-name">${slip.lottery_name||''} — ${slip.round_code||''}</div>
          <div style="font-size:10px;color:#555;display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:2px">
            <span style="font-family:'JetBrains Mono',monospace;font-size:9px;color:#333">#${slip.slip_no}</span>
            ${STATUS_MAP[slip.status] || ''}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
          <div class="slip-total">฿${parseFloat(slip.total_amount).toLocaleString()}</div>
          ${winTotal > 0 ? `<div style="font-size:11px;font-weight:700;color:var(--green)">+฿${winTotal.toLocaleString()}</div>` : ''}
          <span style="color:#444;font-size:12px" id="arr-${slip.id}">›</span>
        </div>
      </div>
      <div id="body-${slip.id}" style="display:none;padding:12px 14px;border-top:1px solid #1a1a1a">
        <div style="overflow-x:auto;margin-bottom:12px">
          <table style="width:100%;border-collapse:collapse">
            <thead><tr>
              <th style="font-size:9px;color:#444;padding:5px 7px;border-bottom:1px solid #1a1a1a;text-align:left">เลข</th>
              <th style="font-size:9px;color:#444;padding:5px 7px;border-bottom:1px solid #1a1a1a;text-align:left">ประเภท</th>
              <th style="font-size:9px;color:#444;padding:5px 7px;border-bottom:1px solid #1a1a1a;text-align:left">อัตรา</th>
              <th style="font-size:9px;color:#444;padding:5px 7px;border-bottom:1px solid #1a1a1a;text-align:left">ราคา</th>
              <th style="font-size:9px;color:#444;padding:5px 7px;border-bottom:1px solid #1a1a1a;text-align:left">ผล</th>
            </tr></thead>
            <tbody>${(slip.items||[]).map(it => `
              <tr style="${it.is_win===1?'background:#0a1a0a':''}" >
                <td style="font-size:16px;font-weight:900;padding:8px 7px;font-family:'JetBrains Mono',monospace;letter-spacing:2px">${it.number}</td>
                <td style="font-size:10px;color:#888;padding:8px 7px">${it.bet_type_name||''}</td>
                <td style="font-size:11px;color:var(--gold);font-weight:700;padding:8px 7px">×${parseFloat(it.payout_rate).toFixed(0)}</td>
                <td style="font-size:11px;color:#ccc;padding:8px 7px">฿${it.amount}</td>
                <td style="padding:8px 7px">
                  ${it.is_win===1 ? `<span style="color:var(--green);font-weight:700">+฿${parseFloat(it.win_amount).toLocaleString()}</span>`
                  : it.is_win===0 ? '<span style="color:#444">—</span>'
                  : '<span style="color:#555;font-size:10px">รอผล</span>'}
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-size:11px;color:#555">ยอดรวม</div>
            <div style="font-size:18px;font-weight:900;color:var(--gold)">฿${parseFloat(slip.total_amount).toLocaleString()}</div>
          </div>
          ${canCancel ? `
            <button onclick="openCancelModal('${slip.id}')"
              style="padding:9px 18px;border-radius:10px;background:#1a0a0a;border:2px solid var(--red);color:var(--red);font-size:12px;font-weight:900;cursor:pointer;font-family:inherit"
              onmouseenter="this.style.background='var(--red)';this.style.color='#fff'"
              onmouseleave="this.style.background='#1a0a0a';this.style.color='var(--red)'">
              ✕ ยกเลิกโพย
            </button>` :
            slip.status === 'active' ? `<span style="font-size:10px;color:var(--red)">🔒 หมดเวลายกเลิก</span>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

function toggleSlipBody(id) {
  const body = document.getElementById('body-' + id);
  const arr  = document.getElementById('arr-'  + id);
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (arr) arr.textContent = open ? '›' : '↓';
}

// ── CANCEL SLIP ───────────────────────────────────────────────
function openCancelModal(slipId) {
  const slip = STATE.mySlips.find(s => String(s.id) === String(slipId));
  if (!slip) return;
  const tl = new Date(slip.close_at) - Date.now();
  if (tl <= 0) return toast('หมดเวลายกเลิกแล้ว', 'err');

  STATE.cancelTarget = slipId;
  const m = Math.floor(tl/60000), s = Math.floor((tl%60000)/1000);
  document.getElementById('cancelModalSub').textContent =
    `โพย ${slip.slip_no} — เหลือเวลา ${m}:${String(s).padStart(2,'0')} นาที · คืนเงิน ฿${parseFloat(slip.total_amount).toLocaleString()}`;
  document.getElementById('cancelModalBody').innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:6px">
      <span style="font-size:13px;font-weight:900;color:var(--gold)">${slip.lottery_name||''}</span>
      <span style="font-size:13px;font-weight:900;color:var(--gold)">฿${parseFloat(slip.total_amount).toLocaleString()}</span>
    </div>
    ${(slip.items||[]).map(it => `
      <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #1a1a1a;font-size:11px">
        <span style="font-family:'JetBrains Mono',monospace;font-weight:900;color:#fff;letter-spacing:2px">${it.number}</span>
        <span style="color:#888">${it.bet_type_name||''}</span>
        <span style="color:var(--gold);font-weight:700">฿${it.amount}</span>
      </div>`).join('')}
    <div style="text-align:right;margin-top:8px;font-size:12px;color:var(--green);font-weight:700">
      💰 คืนเงิน ฿${parseFloat(slip.total_amount).toLocaleString()} เข้ากระเป๋าทันที
    </div>`;

  document.getElementById('cancelConfirmBtn').onclick = doCancel;
  document.getElementById('cancelModal').classList.add('open');
}

async function doCancel() {
  if (!STATE.cancelTarget) return;
  try {
    await Slips.cancel(STATE.cancelTarget);
    closeModal('cancelModal');
    await loadWallet(); updateNavUser();
    await loadMySlips();
    toast(`✅ ยกเลิกโพยแล้ว เงินคืนเข้ากระเป๋าแล้ว`);
  } catch (e) {
    toast(e.message, 'err');
  }
  STATE.cancelTarget = null;
}

// ── UTILS ─────────────────────────────────────────────────────
function selectLotteryType(ltId, ltCode) {
  setTab(1); // ไปหน้าซื้อหวย
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

let _toastTimer;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast on' + (type ? ' ' + type : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('on'), 2800);
}

// ── setTab by key ─────────────────────────────────────────────
function setTabByKey(key) {
  const idx = TABS.findIndex(t => t.key === key);
  if (idx >= 0) setTab(idx);
}

// ── Layout switch (Mobile → Desktop) ─────────────────────────
function switchToDesktop() {
  document.cookie = 'tgl_layout=desktop;path=/;max-age=86400';
  window.location.replace('/desktop/');
}
