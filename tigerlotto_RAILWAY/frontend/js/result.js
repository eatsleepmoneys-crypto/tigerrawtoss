/**
 * TigerLotto — result.js
 * หน้าตรวจผลรางวัล เชื่อม API จริง
 */

// ── ตรวจผลรางวัล (tab ใน main app) ───────────────────────────
async function renderResults() {
  const el = document.getElementById('tab-result');
  if (!el) return;

  el.innerHTML = `
    <div style="font-size:15px;font-weight:900;color:var(--gold);margin-bottom:12px">📊 ผลรางวัล</div>

    <!-- ตรวจเลข -->
    <div class="card" style="margin-bottom:14px">
      <div style="font-size:12px;font-weight:700;color:var(--gold);margin-bottom:10px">🔍 ตรวจเลขของคุณ</div>
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <input id="checkNum" placeholder="กรอกเลขที่ซื้อ" maxlength="6"
          style="flex:1;height:44px;background:var(--dark);border:2px solid #FFD70033;border-radius:10px;
                 color:#fff;font-size:20px;font-weight:900;padding:0 12px;font-family:'JetBrains Mono',monospace;
                 outline:none;letter-spacing:3px;text-align:center"
          oninput="this.style.borderColor=this.value?'var(--gold)':'#FFD70033'">
        <select id="checkType"
          style="width:120px;height:44px;background:#1A1200;border:2px solid #B8860B44;border-radius:10px;
                 color:var(--gold);font-size:12px;padding:0 10px;font-family:inherit;outline:none;cursor:pointer">
          <option value="">ทุกประเภท</option>
          <option value="gov">รัฐบาล</option>
          <option value="yeekee">ยี่กี</option>
          <option value="set">หุ้น SET</option>
          <option value="hanoi">ฮานอย</option>
        </select>
      </div>
      <button onclick="checkNumber()"
        style="width:100%;height:42px;border-radius:10px;background:linear-gradient(135deg,var(--gold),var(--gold2));
               border:none;color:var(--dark);font-size:14px;font-weight:900;cursor:pointer;font-family:inherit">
        🔍 ตรวจผล
      </button>
      <div id="checkResult" style="margin-top:10px"></div>
    </div>

    <!-- Filter tabs -->
    <div id="resultTypeTabs" style="display:flex;gap:5px;margin-bottom:12px;overflow-x:auto;flex-wrap:wrap"></div>

    <!-- Results list -->
    <div id="resultList"></div>
  `;

  buildResultTypeTabs();
  await loadResults();
}

// ── Filter tabs ────────────────────────────────────────────────
let resultTypeFilter = 'all';
function buildResultTypeTabs() {
  const wrap = document.getElementById('resultTypeTabs');
  if (!wrap) return;
  const types = [
    { k:'all',    l:'ทั้งหมด' },
    { k:'gov',    l:'🇹🇭 รัฐบาล' },
    { k:'yeekee', l:'⚡ ยี่กี' },
    { k:'set',    l:'📈 หุ้น SET' },
    { k:'hanoi',  l:'🌏 ฮานอย' },
  ];
  wrap.innerHTML = '';
  types.forEach(t => {
    const on = t.k === resultTypeFilter;
    const btn = document.createElement('button');
    btn.textContent = t.l;
    btn.setAttribute('style', [
      'padding:5px 12px','border-radius:13px','font-size:11px','font-weight:700',
      'cursor:pointer','font-family:inherit','white-space:nowrap','flex-shrink:0',
      on ? 'background:linear-gradient(135deg,var(--gold),var(--gold2));border:2px solid var(--gold);color:var(--dark)'
         : 'background:#1A1200;border:1.5px solid #B8860B44;color:var(--gold)',
    ].join(';'));
    btn.onclick = () => { resultTypeFilter = t.k; buildResultTypeTabs(); loadResults(); };
    wrap.appendChild(btn);
  });
}

// ── Load results from API ──────────────────────────────────────
async function loadResults() {
  const el = document.getElementById('resultList');
  if (!el) return;
  el.innerHTML = '<div style="color:#444;font-size:12px;padding:10px">⏳ กำลังโหลด...</div>';
  try {
    const q = resultTypeFilter !== 'all' ? { lottery_type: resultTypeFilter, limit: 20 } : { limit: 20 };
    const res = await Lottery.results(q);
    const results = res.data || [];
    if (!results.length) {
      el.innerHTML = '<div class="empty"><div class="empty-ico">📊</div><div style="font-size:12px;color:#555">ยังไม่มีผลรางวัล</div></div>';
      return;
    }
    el.innerHTML = results.map(r => `
      <div class="card" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #1a1a1a">
          <div>
            <div style="font-size:13px;font-weight:900;color:var(--gold)">${r.lottery_name||''}</div>
            <div style="font-size:10px;color:#555;margin-top:2px">${r.round_code||''}</div>
          </div>
          <span class="badge badge-ok">✅ ออกผลแล้ว</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
          <div style="background:var(--dark);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:9px;color:#555;margin-bottom:4px">🏆 รางวัลที่ 1</div>
            <div style="font-size:24px;font-weight:900;color:var(--gold);font-family:'JetBrains Mono',monospace;letter-spacing:3px">
              ${r.result_first || '——'}
            </div>
          </div>
          <div style="background:var(--dark);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:9px;color:#555;margin-bottom:4px">2 ตัวท้าย</div>
            <div style="font-size:22px;font-weight:900;color:var(--blue);font-family:'JetBrains Mono',monospace">
              ${r.result_2_back || '--'}
            </div>
          </div>
          <div style="background:var(--dark);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:9px;color:#555;margin-bottom:4px">3 ตัวท้าย</div>
            <div style="font-size:18px;font-weight:900;color:#FF8A5A;font-family:'JetBrains Mono',monospace">
              ${r.result_3_back1 || '---'}
            </div>
          </div>
        </div>
        ${r.result_3_back2 ? `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
          <div style="background:var(--dark);border-radius:8px;padding:8px;text-align:center">
            <div style="font-size:9px;color:#555;margin-bottom:3px">3 ตัวหน้า 1</div>
            <div style="font-size:16px;font-weight:900;color:#aaa;font-family:'JetBrains Mono',monospace">${r.result_3_front1||'---'}</div>
          </div>
          <div style="background:var(--dark);border-radius:8px;padding:8px;text-align:center">
            <div style="font-size:9px;color:#555;margin-bottom:3px">3 ตัวท้าย 2</div>
            <div style="font-size:16px;font-weight:900;color:#aaa;font-family:'JetBrains Mono',monospace">${r.result_3_back2||'---'}</div>
          </div>
        </div>` : ''}
      </div>
    `).join('');
  } catch {
    el.innerHTML = '<div style="color:var(--red);font-size:12px;padding:20px;text-align:center">โหลดผลไม่ได้ กรุณาลองใหม่</div>';
  }
}

// ── ตรวจเลข ───────────────────────────────────────────────────
async function checkNumber() {
  const num    = (document.getElementById('checkNum')?.value || '').trim();
  const type   = document.getElementById('checkType')?.value || '';
  const el     = document.getElementById('checkResult');
  if (!el || !num) { toast('กรุณากรอกเลขที่ต้องการตรวจ', 'warn'); return; }

  el.innerHTML = '<div style="color:#444;font-size:11px">⏳ กำลังตรวจ...</div>';

  try {
    const q = { limit: 10 };
    if (type) q.lottery_type = type;
    const res  = await Lottery.results(q);
    const list = res.data || [];

    const matches = [];
    list.forEach(r => {
      const candidates = [
        { field: 'รางวัลที่ 1',  val: r.result_first,    rate: 750 },
        { field: '3 ตัวท้าย 1', val: r.result_3_back1,  rate: 450 },
        { field: '3 ตัวท้าย 2', val: r.result_3_back2,  rate: 450 },
        { field: '3 ตัวหน้า 1', val: r.result_3_front1, rate: 550 },
        { field: '2 ตัวท้าย',   val: r.result_2_back,   rate: 75  },
      ];
      candidates.forEach(c => {
        if (!c.val) return;
        if (c.val === num ||
            c.val.endsWith(num) ||
            (num.length === 2 && c.val.slice(-2) === num) ||
            (num.length === 3 && (c.val.slice(-3) === num || c.val.slice(0,3) === num))) {
          matches.push({ ...c, round: r.round_code, lotto: r.lottery_name });
        }
      });
    });

    if (matches.length) {
      el.innerHTML = `
        <div style="background:#0a1a0a;border:1.5px solid #3BD44133;border-radius:10px;padding:12px;margin-top:8px">
          <div style="font-size:13px;font-weight:900;color:#3BD441;margin-bottom:8px">🏆 ถูกรางวัล!</div>
          ${matches.map(m => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #1a1a1a;font-size:11px">
              <div>
                <div style="font-weight:700;color:#ccc">${m.lotto} — ${m.round}</div>
                <div style="color:#888;margin-top:2px">${m.field}: <span style="font-family:'JetBrains Mono',monospace;color:#fff;font-weight:700">${m.val}</span></div>
              </div>
              <div style="font-size:13px;font-weight:900;color:#3BD441">×${m.rate}</div>
            </div>`).join('')}
        </div>`;
      toast('🏆 เลข ' + num + ' ถูกรางวัล!');
    } else {
      el.innerHTML = `
        <div style="background:#111;border:1.5px solid #2a2a2a;border-radius:10px;padding:12px;margin-top:8px;text-align:center">
          <div style="font-size:13px;color:#555">เลข <span style="font-family:'JetBrains Mono',monospace;color:#888">${num}</span> ไม่ถูกรางวัลในงวดล่าสุด</div>
        </div>`;
    }
  } catch {
    el.innerHTML = '<div style="color:var(--red);font-size:11px;margin-top:8px">ตรวจไม่ได้ กรุณาลองใหม่</div>';
  }
}
