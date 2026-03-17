/**
 * TigerLotto — admin.js
 * Admin Dashboard เชื่อม API จริง
 * ใช้กับ admin.html
 */

const ADMIN_MENU = [
  { sec: 'ภาพรวม' },
  { k:'dashboard',    icon:'📊', label:'Dashboard'           },
  { k:'users',        icon:'👥', label:'สมาชิก'              },
  { k:'transactions', icon:'💳', label:'ธุรกรรม'             },
  { k:'withdrawals',  icon:'📤', label:'อนุมัติถอน', badge:true },
  { sec: 'หวย' },
  { k:'rounds',       icon:'📅', label:'จัดการงวด'          },
  { k:'enter_result', icon:'🏆', label:'บันทึกผล'           },
  { k:'hot_numbers',  icon:'🔥', label:'เลขฮิต'             },
  { sec: 'ระบบ' },
  { k:'kyc',          icon:'🪪', label:'ตรวจสอบ KYC'        },
  { k:'settings',     icon:'⚙️', label:'ตั้งค่าระบบ'        },
  { k:'report',       icon:'📑', label:'รายงาน'             },
];

let currentPage = 'dashboard';

// ── INIT ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  if (!isLoggedIn()) { location.href = '/'; return; }
  const { user } = getSession();
  if (!['admin','superadmin'].includes(user?.role)) { location.href = '/'; return; }
  buildSidebar(); navTo('dashboard');
});

function buildSidebar() {
  const nav = document.getElementById('sbNav');
  if (!nav) return;
  nav.innerHTML = ADMIN_MENU.map(m => {
    if (m.sec) return `<div class="sb-sec">${m.sec}</div>`;
    return `<div class="sb-item" id="sb-${m.k}" onclick="navTo('${m.k}')">
      <span class="sb-icon">${m.icon}</span>${m.label}
      ${m.badge ? `<span class="sb-badge" id="badge-${m.k}">0</span>` : ''}
    </div>`;
  }).join('');
}

async function navTo(key) {
  currentPage = key;
  document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('on'));
  document.getElementById('sb-' + key)?.classList.add('on');
  const label = ADMIN_MENU.find(m => m.k === key)?.label || key;
  document.getElementById('tbCrumb').textContent = label;
  const el = document.getElementById('mainContent');
  if (!el) return;
  el.innerHTML = '<div style="color:#444;font-size:12px;padding:20px;text-align:center">⏳ กำลังโหลด...</div>';
  try {
    switch(key) {
      case 'dashboard':    await renderDashboard(el);    break;
      case 'users':        await renderUsers(el);        break;
      case 'transactions': await renderTransactions(el); break;
      case 'withdrawals':  await renderWithdrawals(el);  break;
      case 'rounds':       await renderRounds(el);       break;
      case 'enter_result': await renderEnterResult(el);  break;
      case 'hot_numbers':  await renderHotNumbers(el);   break;
      case 'kyc':          await renderKYC(el);          break;
      case 'settings':     await renderSettings(el);     break;
      case 'report':       await renderReport(el);       break;
      default: el.innerHTML = '<div style="color:#555;padding:20px">หน้านี้กำลังพัฒนา</div>';
    }
  } catch(e) {
    el.innerHTML = `<div style="color:var(--red);font-size:12px;padding:20px">${e.message}</div>`;
  }
}

// ── DASHBOARD ─────────────────────────────────────────────────
async function renderDashboard(el) {
  const d = await Admin.dashboard();
  el.innerHTML = `
    <div class="pg-title">📊 Dashboard</div>
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-lbl">สมาชิกทั้งหมด</div><div class="kpi-val">${(d.total_members||0).toLocaleString()}</div><div class="kpi-bar" style="background:var(--gold)"></div></div>
      <div class="kpi"><div class="kpi-lbl">แอ็กทีฟวันนี้</div><div class="kpi-val" style="color:var(--green)">${(d.active_today||0).toLocaleString()}</div><div class="kpi-bar" style="background:var(--green)"></div></div>
      <div class="kpi"><div class="kpi-lbl">รายได้วันนี้</div><div class="kpi-val">฿${parseFloat(d.revenue_today||0).toLocaleString()}</div><div class="kpi-bar" style="background:var(--blue)"></div></div>
      <div class="kpi"><div class="kpi-lbl">รอถอนเงิน</div><div class="kpi-val" style="color:var(--red)">฿${parseFloat(d.pending_withdraw||0).toLocaleString()}</div><div class="kpi-bar" style="background:var(--red)"></div></div>
    </div>
    ${d.pending_kyc > 0 ? `<div style="background:#1a0800;border:1.5px solid #D85A3055;border-radius:10px;padding:12px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:12px;color:var(--red)">⚠️ รอตรวจสอบ KYC ${d.pending_kyc} รายการ</span>
      <button onclick="navTo('kyc')" style="padding:5px 12px;border-radius:7px;background:var(--red);border:none;color:#fff;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">ดูเลย</button>
    </div>` : ''}`;
}

// ── USERS ─────────────────────────────────────────────────────
async function renderUsers(el) {
  const res = await Admin.users({ limit: 30 });
  const users = res.data || [];
  el.innerHTML = `
    <div class="pg-title">👥 สมาชิก
      <div style="font-size:12px;color:#555">${(res.total||users.length).toLocaleString()} คน</div>
    </div>
    <div class="card" style="padding:8px;overflow-x:auto">
      <table>
        <thead><tr><th>ชื่อ</th><th>เบอร์</th><th>Role</th><th>VIP</th><th>ยืนยัน</th><th>สมัคร</th><th>จัดการ</th></tr></thead>
        <tbody>${users.map(u => `
          <tr>
            <td style="color:#ccc;font-weight:600">${u.first_name||''} ${u.last_name||''}</td>
            <td style="font-family:'JetBrains Mono',monospace;font-size:10px">${u.phone||''}</td>
            <td><span class="badge ${u.role==='superadmin'||u.role==='admin'?'b-ok':u.role==='agent'?'b-pend':''}">
              ${u.role}</span></td>
            <td style="color:var(--gold)">⭐ ${u.vip_tier||'bronze'}</td>
            <td>${u.is_verified ? '<span class="badge b-ok">✓</span>' : '<span class="badge b-fail">✕</span>'}</td>
            <td style="font-size:10px;color:#555">${new Date(u.created_at).toLocaleDateString('th-TH')}</td>
            <td style="display:flex;gap:4px">
              <button onclick="toggleUser(${u.id},${u.is_active})"
                style="padding:2px 7px;border-radius:4px;font-size:8px;font-weight:700;cursor:pointer;font-family:inherit;
                       background:${u.is_active?'#1a0a0a':'#0a1a0a'};border:1px solid ${u.is_active?'#D85A3033':'#3BD44133'};
                       color:${u.is_active?'var(--red)':'var(--green)'}">
                ${u.is_active ? 'ระงับ' : 'เปิด'}
              </button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function toggleUser(id, isActive) {
  try {
    await Admin.userStatus(id, { is_active: isActive ? 0 : 1, is_banned: 0 });
    toast((isActive ? '🚫 ระงับ' : '✅ เปิด') + ' สมาชิก #' + id);
    navTo('users');
  } catch(e) { toast(e.message, 'err'); }
}

// ── TRANSACTIONS ──────────────────────────────────────────────
async function renderTransactions(el) {
  const res = await Admin.transactions({ limit: 30 });
  const txs = res.data || [];
  el.innerHTML = `
    <div class="pg-title">💳 ธุรกรรม</div>
    <div class="card" style="padding:8px;overflow-x:auto">
      <table>
        <thead><tr><th>REF</th><th>สมาชิก</th><th>ประเภท</th><th>จำนวน</th><th>สถานะ</th><th>เวลา</th></tr></thead>
        <tbody>${txs.map(tx => `
          <tr>
            <td style="font-family:'JetBrains Mono',monospace;font-size:9px;color:#444">${tx.ref_no||''}</td>
            <td style="font-size:11px;color:#ccc">${tx.first_name||''} ${tx.last_name||''}</td>
            <td><span class="badge ${tx.type==='deposit'||tx.type==='win'?'b-ok':tx.type==='withdraw'?'b-fail':'b-pend'}">${tx.type}</span></td>
            <td style="font-size:12px;font-weight:700;color:${['deposit','win','bonus'].includes(tx.type)?'var(--green)':'var(--red)'}">
              ${['deposit','win','bonus'].includes(tx.type)?'+':'-'}฿${parseFloat(tx.amount||0).toLocaleString()}</td>
            <td><span class="badge ${tx.status==='success'?'b-ok':tx.status==='pending'?'b-pend':'b-fail'}">${tx.status}</span></td>
            <td style="font-size:10px;color:#555">${new Date(tx.created_at).toLocaleDateString('th-TH',{hour:'2-digit',minute:'2-digit'})}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// ── WITHDRAWALS ───────────────────────────────────────────────
async function renderWithdrawals(el) {
  const res = await Admin.transactions({ type:'withdraw', status:'pending', limit:50 });
  const txs = res.data || [];
  const badge = document.getElementById('badge-withdrawals');
  if (badge) badge.textContent = txs.length;

  el.innerHTML = `
    <div class="pg-title">📤 อนุมัติถอนเงิน
      <span style="font-size:12px;font-weight:400;color:#555">${txs.length} รายการรออนุมัติ</span>
    </div>
    ${txs.length ? `<div class="card" style="padding:8px;overflow-x:auto">
      <table>
        <thead><tr><th>REF</th><th>สมาชิก</th><th>จำนวน</th><th>วันที่</th><th>อนุมัติ</th></tr></thead>
        <tbody>${txs.map(tx => `
          <tr>
            <td style="font-family:'JetBrains Mono',monospace;font-size:9px;color:#444">${tx.ref_no||''}</td>
            <td style="color:#ccc">${tx.first_name||''} ${tx.last_name||''}<br><span style="font-size:9px;color:#555">${tx.phone||''}</span></td>
            <td style="font-size:14px;font-weight:900;color:var(--gold)">฿${parseFloat(tx.amount||0).toLocaleString()}</td>
            <td style="font-size:10px;color:#555">${new Date(tx.created_at).toLocaleDateString('th-TH')}</td>
            <td>
              <button onclick="approveWithdraw(${tx.id})"
                style="padding:4px 10px;border-radius:6px;background:linear-gradient(135deg,var(--gold),var(--gold2));border:none;color:var(--dark);font-size:10px;font-weight:900;cursor:pointer;font-family:inherit">
                ✅ อนุมัติ
              </button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '<div class="card" style="text-align:center;padding:30px;color:#444">✅ ไม่มีรายการรออนุมัติ</div>'}`;
}

async function approveWithdraw(id) {
  try {
    await Admin.approveWD(id);
    toast('✅ อนุมัติถอนเงินแล้ว');
    navTo('withdrawals');
  } catch(e) { toast(e.message, 'err'); }
}

// ── ENTER RESULT ──────────────────────────────────────────────
async function renderEnterResult(el) {
  const res = await Lottery.rounds({ status: 'closed' });
  const rounds = res.data || [];
  el.innerHTML = `
    <div class="pg-title">🏆 บันทึกผลรางวัล</div>
    <div class="card">
      <div style="margin-bottom:10px">
        <label style="font-size:11px;color:var(--gold);font-weight:700;margin-bottom:5px;display:block">เลือกงวด (ที่ปิดรับแล้ว)</label>
        <select id="resultRoundId"
          style="width:100%;height:40px;background:var(--dark);border:1.5px solid #FFD70033;border-radius:8px;color:var(--gold);font-size:12px;padding:0 12px;font-family:inherit;outline:none;margin-bottom:10px">
          <option value="">-- เลือกงวด --</option>
          ${rounds.map(r => `<option value="${r.id}">${r.lottery_name||''} — ${r.round_code||''}</option>`).join('')}
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div><label style="font-size:11px;color:var(--gold);font-weight:700;margin-bottom:4px;display:block">รางวัลที่ 1 (6 หลัก)</label>
          <input class="finput" id="r1" placeholder="XXXXXX" maxlength="6" style="font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:900;letter-spacing:4px;text-align:center"></div>
        <div><label style="font-size:11px;color:var(--gold);font-weight:700;margin-bottom:4px;display:block">2 ตัวท้าย</label>
          <input class="finput" id="r2b" placeholder="XX" maxlength="2" style="font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:900;letter-spacing:4px;text-align:center"></div>
        <div><label style="font-size:11px;color:var(--gold);font-weight:700;margin-bottom:4px;display:block">3 ตัวท้าย 1</label>
          <input class="finput" id="r3b1" placeholder="XXX" maxlength="3" style="font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:900;letter-spacing:3px;text-align:center"></div>
        <div><label style="font-size:11px;color:var(--gold);font-weight:700;margin-bottom:4px;display:block">3 ตัวท้าย 2</label>
          <input class="finput" id="r3b2" placeholder="XXX" maxlength="3" style="font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:900;letter-spacing:3px;text-align:center"></div>
        <div><label style="font-size:11px;color:var(--gold);font-weight:700;margin-bottom:4px;display:block">3 ตัวหน้า 1</label>
          <input class="finput" id="r3f1" placeholder="XXX" maxlength="3" style="font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:900;letter-spacing:3px;text-align:center"></div>
        <div><label style="font-size:11px;color:var(--gold);font-weight:700;margin-bottom:4px;display:block">3 ตัวหน้า 2</label>
          <input class="finput" id="r3f2" placeholder="XXX" maxlength="3" style="font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:900;letter-spacing:3px;text-align:center"></div>
      </div>
      <button onclick="submitResult()"
        style="width:100%;height:46px;border-radius:10px;background:linear-gradient(135deg,var(--gold),var(--gold2));border:none;color:var(--dark);font-size:15px;font-weight:900;cursor:pointer;font-family:inherit">
        ✅ บันทึกผลและแจ้งเตือนผู้ถูกทันที
      </button>
    </div>`;
}

async function submitResult() {
  const roundId = document.getElementById('resultRoundId')?.value;
  if (!roundId) return toast('กรุณาเลือกงวด', 'w');
  const body = {
    result_first:  document.getElementById('r1')?.value,
    result_2_back: document.getElementById('r2b')?.value,
    result_3_back1:document.getElementById('r3b1')?.value,
    result_3_back2:document.getElementById('r3b2')?.value,
    result_3_front1:document.getElementById('r3f1')?.value,
    result_3_front2:document.getElementById('r3f2')?.value,
  };
  if (!body.result_first) return toast('กรุณาใส่รางวัลที่ 1', 'w');
  try {
    await Admin.enterResult(roundId, body);
    toast('✅ บันทึกผลแล้ว กำลังคำนวณรางวัล...');
  } catch(e) { toast(e.message, 'err'); }
}

// ── HOT NUMBERS ───────────────────────────────────────────────
async function renderHotNumbers(el) {
  const res = await Admin.hotNumbers({ limit: 20 });
  const nums = res.data || [];
  el.innerHTML = `
    <div class="pg-title">🔥 เลขยอดนิยม</div>
    <div class="card" style="padding:8px;overflow-x:auto">
      <table>
        <thead><tr><th>#</th><th>เลข</th><th>จำนวนซื้อ</th><th>ยอดรวม</th><th>ความเสี่ยงจ่าย</th></tr></thead>
        <tbody>${nums.map((n,i) => {
          const risk = parseFloat(n.total_amount||0) * 750;
          return `<tr>
            <td style="color:${i<3?'var(--gold)':'#555'};font-weight:700">#${i+1}</td>
            <td style="font-size:18px;font-weight:900;font-family:'JetBrains Mono',monospace;color:var(--gold)">${n.number}</td>
            <td style="color:var(--blue)">${(n.bet_count||0).toLocaleString()} ครั้ง</td>
            <td style="color:var(--gold);font-weight:700">฿${parseFloat(n.total_amount||0).toLocaleString()}</td>
            <td style="color:${risk>500000?'var(--red)':'var(--green)'};font-weight:700">
              ฿${(risk/1000000).toFixed(1)}M ${risk>500000?'⚠️':''}</td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>
    </div>`;
}

// ── KYC ───────────────────────────────────────────────────────
async function renderKYC(el) {
  const res = await Admin.kycList({ status:'pending' });
  const list = res.data || [];
  const badge = document.getElementById('badge-kyc');
  el.innerHTML = `
    <div class="pg-title">🪪 ตรวจสอบ KYC
      <span style="font-size:12px;font-weight:400;color:#555">${list.length} รายการ</span>
    </div>
    ${list.length ? list.map(k => `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
          <div>
            <div style="font-size:13px;font-weight:700;color:#fff">${k.first_name||''} ${k.last_name||''}</div>
            <div style="font-size:10px;color:#555;margin-top:2px">${k.phone||''}</div>
            <div style="font-size:10px;color:#555;margin-top:2px">เลขบัตร: <span style="font-family:'JetBrains Mono',monospace">${k.id_card_number||''}</span></div>
            <div style="font-size:10px;color:#555">ส่งมาเมื่อ: ${new Date(k.created_at).toLocaleDateString('th-TH')}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="approveKYC(${k.id})"
            style="flex:1;height:36px;border-radius:8px;background:linear-gradient(135deg,var(--gold),var(--gold2));border:none;color:var(--dark);font-size:12px;font-weight:900;cursor:pointer;font-family:inherit">
            ✅ อนุมัติ
          </button>
          <button onclick="rejectKYC(${k.id})"
            style="flex:1;height:36px;border-radius:8px;background:#1a0a0a;border:1.5px solid #D85A3033;color:var(--red);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">
            ✕ ปฏิเสธ
          </button>
        </div>
      </div>`).join('') :
    '<div class="card" style="text-align:center;padding:30px;color:#444">✅ ไม่มีรายการรอตรวจสอบ</div>'}`;
}

async function approveKYC(id) {
  try { await Admin.approveKYC(id); toast('✅ อนุมัติ KYC แล้ว'); navTo('kyc'); }
  catch(e) { toast(e.message, 'err'); }
}
async function rejectKYC(id) {
  const reason = prompt('เหตุผลที่ปฏิเสธ:') || 'เอกสารไม่ชัดเจน';
  try { await Admin.rejectKYC(id, { reason }); toast('❌ ปฏิเสธ KYC แล้ว'); navTo('kyc'); }
  catch(e) { toast(e.message, 'err'); }
}

// ── SETTINGS ──────────────────────────────────────────────────
async function renderSettings(el) {
  const res = await Admin.settings();
  const settings = res.data || [];
  el.innerHTML = `
    <div class="pg-title">⚙️ ตั้งค่าระบบ</div>
    <div class="card" style="padding:8px;overflow-x:auto">
      <table>
        <thead><tr><th>Key</th><th>กลุ่ม</th><th>คำอธิบาย</th><th>ค่า</th><th>บันทึก</th></tr></thead>
        <tbody>${settings.map(s => `
          <tr>
            <td style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--gold)">${s.key}</td>
            <td style="font-size:10px;color:#555">${s.group_name||''}</td>
            <td style="font-size:10px;color:#888">${s.description||''}</td>
            <td><input id="setting-${s.key}" value="${s.value||''}"
              style="width:100px;height:30px;background:var(--dark);border:1px solid #FFD70033;border-radius:6px;
                     color:var(--gold);font-size:12px;font-weight:700;text-align:center;font-family:inherit;outline:none"
              onfocus="this.style.borderColor='var(--gold)'" onblur="this.style.borderColor='#FFD70033'"></td>
            <td><button onclick="saveSetting('${s.key}')"
              style="padding:3px 8px;border-radius:5px;background:linear-gradient(135deg,var(--gold),var(--gold2));border:none;color:var(--dark);font-size:9px;font-weight:900;cursor:pointer;font-family:inherit">
              บันทึก
            </button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function saveSetting(key) {
  const val = document.getElementById('setting-' + key)?.value;
  try { await Admin.updateSetting(key, val); toast('✅ บันทึก ' + key); }
  catch(e) { toast(e.message, 'err'); }
}

// ── REPORT ────────────────────────────────────────────────────
async function renderReport(el) {
  const now = new Date();
  const res  = await Admin.report({ year: now.getFullYear(), month: now.getMonth()+1 });
  el.innerHTML = `
    <div class="pg-title">📑 รายงานประจำเดือน
      <button onclick="renderReport(document.getElementById('mainContent'))"
        style="padding:5px 12px;border-radius:7px;background:var(--dark3);border:1.5px solid #1e1e1e;color:#888;font-size:11px;cursor:pointer;font-family:inherit">
        🔄 รีเฟรช
      </button>
    </div>
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-lbl">รายรับ</div><div class="kpi-val">฿${parseFloat(res.revenue||0).toLocaleString()}</div><div class="kpi-bar" style="background:var(--gold)"></div></div>
      <div class="kpi"><div class="kpi-lbl">จ่ายรางวัล</div><div class="kpi-val" style="color:var(--red)">฿${parseFloat(res.payout||0).toLocaleString()}</div><div class="kpi-bar" style="background:var(--red)"></div></div>
      <div class="kpi"><div class="kpi-lbl">กำไรสุทธิ</div><div class="kpi-val" style="color:var(--green)">฿${parseFloat(res.profit||0).toLocaleString()}</div><div class="kpi-bar" style="background:var(--green)"></div></div>
      <div class="kpi"><div class="kpi-lbl">สมาชิกใหม่</div><div class="kpi-val" style="color:var(--blue)">${(res.new_members||0).toLocaleString()}</div><div class="kpi-bar" style="background:var(--blue)"></div></div>
    </div>`;
}

// ── ROUNDS ────────────────────────────────────────────────────
async function renderRounds(el) {
  const res = await Lottery.rounds({ status:'open' });
  const rounds = res.data || [];
  el.innerHTML = `
    <div class="pg-title">📅 งวดที่เปิดรับอยู่</div>
    ${rounds.length ? rounds.map(r => `
      <div class="card" style="display:flex;align-items:center;gap:12px">
        <div style="font-size:24px">${r.icon||'🎯'}</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700;color:var(--gold)">${r.name||''} — ${r.round_code||''}</div>
          <div style="font-size:10px;color:#555;margin-top:2px">ปิดรับ: ${new Date(r.close_at).toLocaleString('th-TH')}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:13px;font-weight:700;color:var(--gold)">฿${parseFloat(r.total_bet_amount||0).toLocaleString()}</div>
          <div style="font-size:10px;color:#555">ยอดรวม</div>
        </div>
      </div>`).join('') :
    '<div class="card" style="text-align:center;padding:30px;color:#444">ไม่มีงวดที่เปิดรับอยู่</div>'}`;
}

// ── LOGOUT ────────────────────────────────────────────────────
function doLogout() { clearSession(); location.href = '/'; }

// ── TOAST ─────────────────────────────────────────────────────
let _t;
function toast(msg, type='') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg; el.className = 'toast on' + (type ? ' '+type : '');
  clearTimeout(_t); _t = setTimeout(() => el.classList.remove('on'), 2800);
}
