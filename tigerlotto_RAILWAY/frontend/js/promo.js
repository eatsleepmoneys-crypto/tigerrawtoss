/**
 * TigerLotto — promo.js
 * หน้าโปรโมชั่น เชื่อม API จริง
 */

async function renderPromos() {
  const el = document.getElementById('tab-promo');
  if (!el) return;

  el.innerHTML = `
    <div style="font-size:15px;font-weight:900;color:var(--gold);margin-bottom:12px">🎁 โปรโมชั่น</div>
    <div id="promoGrid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"></div>
  `;
  await loadPromos();
}

async function loadPromos() {
  const grid = document.getElementById('promoGrid');
  if (!grid) return;
  grid.innerHTML = '<div style="grid-column:1/-1;color:#444;font-size:12px;padding:10px">⏳ กำลังโหลด...</div>';
  try {
    const res    = await Promos.list();
    const promos = res.data || [];
    if (!promos.length) {
      grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="empty-ico">🎁</div><div style="font-size:12px;color:#555">ยังไม่มีโปรโมชั่น</div></div>';
      return;
    }

    const TYPE_META = {
      bonus:    { color:'#FFD700', bg:'#1A1200', bd:'#B8860B' },
      cashback: { color:'#3BD441', bg:'#0a1a0a', bd:'#3BD441' },
      referral: { color:'#FF8A5A', bg:'#1a0800', bd:'#D85A30' },
      deposit:  { color:'#3BD441', bg:'#0D1A00', bd:'#3BD441' },
      special:  { color:'#AFA9EC', bg:'#0D0D1A', bd:'#534AB7' },
    };

    grid.innerHTML = promos.map(p => {
      const m = TYPE_META[p.type] || TYPE_META.special;
      return `
        <div style="background:${m.bg};border:1.5px solid ${m.bd}55;border-radius:14px;padding:14px;
                    display:flex;flex-direction:column;gap:8px;position:relative;overflow:hidden">
          <div style="position:absolute;top:8px;right:8px;font-size:9px;padding:2px 7px;border-radius:6px;
                      font-weight:700;background:${m.bd}22;color:${m.color};border:1px solid ${m.bd}44">
            ${p.type}
          </div>
          <div style="font-size:28px;text-align:center">${p.icon || '🎁'}</div>
          <div style="font-size:12px;font-weight:900;color:${m.color}">${p.name}</div>
          <div style="font-size:10px;color:#888;line-height:1.5">${p.description||''}</div>
          <div style="font-size:20px;font-weight:900;color:#3BD441">${p.value}</div>
          <div style="font-size:9px;color:#555">⏰ ${p.end_at ? new Date(p.end_at).toLocaleDateString('th-TH') : 'ไม่มีวันหมดอายุ'}</div>
          <button onclick="claimPromo(${p.id}, this)"
            style="width:100%;height:36px;border-radius:9px;background:linear-gradient(135deg,var(--gold),var(--gold2));
                   border:none;color:var(--dark);font-size:12px;font-weight:900;cursor:pointer;font-family:inherit">
            รับสิทธิ์ →
          </button>
        </div>`;
    }).join('');
  } catch {
    grid.innerHTML = '<div style="grid-column:1/-1;color:var(--red);font-size:12px;padding:10px">โหลดไม่ได้</div>';
  }
}

async function claimPromo(id, btn) {
  if (!isLoggedIn()) return toast('กรุณาเข้าสู่ระบบก่อน', 'warn');
  btn.textContent = '⏳...'; btn.disabled = true;
  try {
    const res = await Promos.claim(id);
    btn.textContent = '✅ รับแล้ว';
    btn.style.background = '#0a1a0a';
    btn.style.color = '#3BD441';
    toast(`✅ รับโปรโมชั่นแล้ว! +฿${parseFloat(res.amount_received||0).toLocaleString()}`);
    await loadWallet(); updateNavUser();
  } catch (e) {
    btn.textContent = e.code === 'ALREADY_CLAIMED' ? '✓ รับแล้ว' : 'รับสิทธิ์ →';
    btn.disabled = false;
    toast(e.code === 'ALREADY_CLAIMED' ? 'ได้รับโปรโมชั่นนี้แล้ว' : e.message, 'warn');
  }
}
