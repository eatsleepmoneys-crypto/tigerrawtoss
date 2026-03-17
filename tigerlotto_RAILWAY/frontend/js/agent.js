/**
 * TigerLotto — agent.js
 * Agent Portal เชื่อม API จริง
 */

async function renderAgentPortal() {
  const el = document.getElementById('tab-agent');
  if (!el) return;

  // ตรวจสอบว่าเป็น Agent
  const user = STATE.user;
  if (!user || !['agent','sub_agent','admin','superadmin'].includes(user.role)) {
    el.innerHTML = `
      <div class="empty">
        <div class="empty-ico">🎯</div>
        <div style="font-size:14px;font-weight:700;color:#555;margin-bottom:8px">ไม่มีสิทธิ์เข้าถึง</div>
        <div style="font-size:12px;color:#444">หน้านี้สำหรับตัวแทน (Agent) เท่านั้น</div>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div style="font-size:15px;font-weight:900;color:var(--gold);margin-bottom:12px">🎯 Agent Portal</div>
    <div id="agentTabRow" style="display:flex;gap:0;background:var(--dark2);border-radius:10px;padding:4px;gap:4px;margin-bottom:14px"></div>
    <div id="agentContent"></div>
  `;

  buildAgentTabs('dashboard');
}

let agentActiveTab = 'dashboard';
function buildAgentTabs(active) {
  agentActiveTab = active;
  const row = document.getElementById('agentTabRow');
  if (!row) return;
  const tabs = [
    { k:'dashboard', l:'📊 Dashboard' },
    { k:'members',   l:'👥 สมาชิก'   },
    { k:'commissions',l:'💰 Commission'},
    { k:'referral',  l:'🔗 แนะนำ'    },
  ];
  row.innerHTML = '';
  tabs.forEach(t => {
    const on = t.k === active;
    const btn = document.createElement('button');
    btn.textContent = t.l;
    btn.setAttribute('style', [
      'flex:1;padding:8px 6px;border-radius:8px;font-size:11px;font-weight:700',
      'cursor:pointer;font-family:inherit;border:none;transition:all .2s',
      on ? 'background:linear-gradient(135deg,var(--gold),var(--gold2));color:var(--dark)'
         : 'background:transparent;color:#666',
    ].join(';'));
    btn.onclick = () => { buildAgentTabs(t.k); loadAgentContent(t.k); };
    row.appendChild(btn);
  });
  loadAgentContent(active);
}

async function loadAgentContent(tab) {
  const el = document.getElementById('agentContent');
  if (!el) return;
  el.innerHTML = '<div style="color:#444;font-size:12px;padding:10px">⏳ กำลังโหลด...</div>';
  try {
    switch (tab) {
      case 'dashboard':  await renderAgentDashboard(el);   break;
      case 'members':    await renderAgentMembers(el);     break;
      case 'commissions':await renderAgentCommissions(el); break;
      case 'referral':   await renderAgentReferral(el);    break;
    }
  } catch (e) {
    el.innerHTML = `<div style="color:var(--red);font-size:12px;padding:10px">${e.message}</div>`;
  }
}

async function renderAgentDashboard(el) {
  const d = await Agent.dashboard();
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
      <div class="kpi"><div class="kpi-lbl">Commission เดือนนี้</div>
        <div class="kpi-val">฿${parseFloat(d.commission_this_month||0).toLocaleString()}</div>
        <div class="kpi-bar" style="background:var(--gold)"></div></div>
      <div class="kpi"><div class="kpi-lbl">สมาชิกในทีม</div>
        <div class="kpi-val" style="color:var(--green)">${d.member_count||0}</div>
        <div class="kpi-bar" style="background:var(--green)"></div></div>
      <div class="kpi"><div class="kpi-lbl">ยอดทีมเดือนนี้</div>
        <div class="kpi-val" style="color:var(--blue)">฿${parseFloat(d.team_bet_volume||0).toLocaleString()}</div>
        <div class="kpi-bar" style="background:var(--blue)"></div></div>
      <div class="kpi"><div class="kpi-lbl">Commission รวม</div>
        <div class="kpi-val" style="color:#B8860B">฿${parseFloat(d.total_commission||0).toLocaleString()}</div>
        <div class="kpi-bar" style="background:#B8860B"></div></div>
    </div>
    <div class="card" style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:11px;color:#555">รหัสตัวแทน</div>
        <div style="font-size:18px;font-weight:900;color:var(--gold);font-family:'JetBrains Mono',monospace;letter-spacing:2px">${d.agent_code||'-'}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:10px;color:#555">L1: ${(d.commission_l1*100).toFixed(1)}% | L2: ${(d.commission_l2*100).toFixed(1)}% | L3: ${(d.commission_l3*100).toFixed(1)}%</div>
      </div>
    </div>`;
}

async function renderAgentMembers(el) {
  const res = await Agent.members({ limit: 20 });
  const members = res.data || [];
  if (!members.length) { el.innerHTML = '<div class="empty"><div class="empty-ico">👥</div><div style="font-size:12px;color:#555">ยังไม่มีสมาชิก</div></div>'; return; }
  el.innerHTML = `<div class="card" style="padding:8px;overflow-x:auto">
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>
        <th style="font-size:9px;color:#444;padding:5px 8px;border-bottom:1px solid #1a1a1a;text-align:left">ชื่อ</th>
        <th style="font-size:9px;color:#444;padding:5px 8px;border-bottom:1px solid #1a1a1a;text-align:left">เบอร์</th>
        <th style="font-size:9px;color:#444;padding:5px 8px;border-bottom:1px solid #1a1a1a;text-align:right">ยอดแทง</th>
        <th style="font-size:9px;color:#444;padding:5px 8px;border-bottom:1px solid #1a1a1a;text-align:right">Comm</th>
      </tr></thead>
      <tbody>${members.map(m => `
        <tr style="border-bottom:1px solid #0f0f0f">
          <td style="padding:8px;font-size:11px;color:#ccc">${m.first_name||''} ${m.last_name||''}</td>
          <td style="padding:8px;font-size:10px;color:#555;font-family:'JetBrains Mono',monospace">${m.phone||''}</td>
          <td style="padding:8px;font-size:11px;color:var(--gold);font-weight:700;text-align:right">฿${parseFloat(m.total_bet||0).toLocaleString()}</td>
          <td style="padding:8px;font-size:11px;color:var(--green);font-weight:700;text-align:right">+฿${parseFloat(m.commission_earned||0).toLocaleString()}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
}

async function renderAgentCommissions(el) {
  const res = await Agent.commissions({ limit: 20 });
  const items = res.data || [];
  el.innerHTML = `
    <div class="card" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div><div style="font-size:11px;color:#555">รอถอน</div>
        <div style="font-size:20px;font-weight:900;color:var(--gold)">฿${parseFloat(res.pending_total||0).toLocaleString()}</div></div>
      <button onclick="openAgentWithdraw()"
        style="padding:8px 16px;border-radius:8px;background:linear-gradient(135deg,var(--gold),var(--gold2));
               border:none;color:var(--dark);font-size:12px;font-weight:900;cursor:pointer;font-family:inherit">
        💰 ถอน Commission
      </button>
    </div>
    ${items.length ? `<div class="card" style="padding:8px;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="font-size:9px;color:#444;padding:5px 8px;border-bottom:1px solid #1a1a1a;text-align:left">โพย</th>
          <th style="font-size:9px;color:#444;padding:5px 8px;border-bottom:1px solid #1a1a1a;text-align:center">Level</th>
          <th style="font-size:9px;color:#444;padding:5px 8px;border-bottom:1px solid #1a1a1a;text-align:right">จำนวน</th>
          <th style="font-size:9px;color:#444;padding:5px 8px;border-bottom:1px solid #1a1a1a;text-align:center">สถานะ</th>
        </tr></thead>
        <tbody>${items.map(c => `
          <tr style="border-bottom:1px solid #0f0f0f">
            <td style="padding:8px;font-size:10px;color:#aaa;font-family:'JetBrains Mono',monospace">${c.slip_no||'-'}</td>
            <td style="padding:8px;font-size:11px;color:#78BAFF;text-align:center;font-weight:700">L${c.level}</td>
            <td style="padding:8px;font-size:12px;color:var(--green);font-weight:700;text-align:right">+฿${parseFloat(c.amount||0).toLocaleString()}</td>
            <td style="padding:8px;text-align:center"><span class="badge ${c.status==='paid'?'badge-ok':'badge-pend'}">${c.status==='paid'?'จ่ายแล้ว':'รอจ่าย'}</span></td>
          </tr>`).join('')}
        </tbody></table></div>` :
      '<div class="empty"><div class="empty-ico">💰</div><div style="font-size:12px;color:#555">ยังไม่มี Commission</div></div>'}`;
}

async function renderAgentReferral(el) {
  const res = await Agent.referralLink();
  el.innerHTML = `
    <div class="card">
      <div style="font-size:12px;color:#555;margin-bottom:6px">รหัสตัวแทน</div>
      <div style="font-size:22px;font-weight:900;color:var(--gold);font-family:'JetBrains Mono',monospace;letter-spacing:3px;margin-bottom:10px">
        ${res.agent_code||'-'}
      </div>
      <div style="font-size:12px;color:#555;margin-bottom:6px">ลิงก์แนะนำสมาชิก</div>
      <div style="display:flex;gap:8px;align-items:center">
        <div style="flex:1;font-size:11px;color:#3BD441;font-family:'JetBrains Mono',monospace;word-break:break-all;background:var(--dark);border-radius:8px;padding:8px 10px">
          ${res.referral_url||'-'}
        </div>
        <button onclick="navigator.clipboard.writeText('${res.referral_url||''}').then(()=>toast('📋 คัดลอกแล้ว!'))"
          style="padding:8px 12px;border-radius:8px;background:#1A1200;border:1.5px solid var(--gold);color:var(--gold);
                 font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;flex-shrink:0">
          📋 Copy
        </button>
      </div>
    </div>`;
}

function openAgentWithdraw() {
  toast('ใช้เมนู "กระเป๋า → ถอนเงิน" เพื่อถอน Commission ครับ', 'warn');
}
