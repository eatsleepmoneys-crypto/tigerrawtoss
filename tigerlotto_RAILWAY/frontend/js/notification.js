/**
 * TigerLotto — notification.js
 * ระบบแจ้งเตือน เชื่อม API จริง
 */

let notifFilter = 'all';

// ── Render notification tab ────────────────────────────────────
async function renderNotifications() {
  const el = document.getElementById('tab-notif');
  if (!el) return;

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:15px;font-weight:900;color:var(--gold)">🔔 การแจ้งเตือน</div>
      <button onclick="markAllRead()"
        style="padding:5px 12px;border-radius:8px;background:#1A1200;border:1.5px solid var(--gold2);
               color:var(--gold2);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">
        ✓ อ่านทั้งหมด
      </button>
    </div>
    <div id="notifFilters" style="display:flex;gap:5px;margin-bottom:12px;flex-wrap:wrap"></div>
    <div id="notifList"></div>
  `;

  buildNotifFilters();
  await loadNotifications();
}

function buildNotifFilters() {
  const wrap = document.getElementById('notifFilters');
  if (!wrap) return;
  const types = [
    { k:'all',   l:'ทั้งหมด' },
    { k:'0',     l:'🔵 ยังไม่อ่าน' },
    { k:'win',   l:'🏆 รางวัล' },
    { k:'deposit',l:'💰 การเงิน' },
    { k:'promo', l:'🎁 โปรโมชั่น' },
  ];
  wrap.innerHTML = '';
  types.forEach(t => {
    const on = t.k === notifFilter;
    const btn = document.createElement('button');
    btn.textContent = t.l;
    btn.setAttribute('style', [
      'padding:5px 12px','border-radius:13px','font-size:11px','font-weight:700',
      'cursor:pointer','font-family:inherit','flex-shrink:0',
      on ? 'background:linear-gradient(135deg,var(--gold),var(--gold2));border:2px solid var(--gold);color:var(--dark)'
         : 'background:#1A1200;border:1.5px solid #B8860B44;color:var(--gold)',
    ].join(';'));
    btn.onclick = () => { notifFilter = t.k; buildNotifFilters(); loadNotifications(); };
    wrap.appendChild(btn);
  });
}

async function loadNotifications() {
  const el = document.getElementById('notifList');
  if (!el) return;
  el.innerHTML = '<div style="color:#444;font-size:12px;padding:10px">⏳ กำลังโหลด...</div>';
  try {
    const q = {};
    if (notifFilter === '0') q.is_read = 0;
    const res   = await Notif.list(q);
    const items = res.data || [];

    if (!items.length) {
      el.innerHTML = '<div class="empty"><div class="empty-ico">🔔</div><div style="font-size:12px;color:#555">ไม่มีการแจ้งเตือน</div></div>';
      return;
    }

    const TYPE_META = {
      win:        { icon:'🏆', bg:'#1A1200', bc:'#B8860B55' },
      deposit:    { icon:'💰', bg:'#0a1a0a', bc:'#3BD44133' },
      withdraw:   { icon:'📤', bg:'#1a0a0a', bc:'#D85A3033' },
      promo:      { icon:'🎁', bg:'#1A1200', bc:'#FFD70033' },
      system:     { icon:'⚙️', bg:'#111',   bc:'#2a2a2a'   },
      otp:        { icon:'🔐', bg:'#111',   bc:'#2a2a2a'   },
    };

    el.innerHTML = items.map(n => {
      const m = TYPE_META[n.type] || TYPE_META.system;
      const unread = !n.is_read;
      return `
        <div onclick="readNotif(${n.id}, this)"
          style="background:${unread ? 'var(--dark2)' : 'var(--dark3)'};border:1.5px solid ${unread ? 'var(--gold2)' : '#1e1e1e'};
                 border-radius:12px;padding:12px 14px;margin-bottom:8px;display:flex;align-items:flex-start;
                 gap:10px;cursor:pointer;transition:all .2s"
          onmouseenter="this.style.borderColor='#B8860B55'" onmouseleave="this.style.borderColor='${unread?'var(--gold2)':'#1e1e1e'}'">
          <div style="width:38px;height:38px;border-radius:10px;background:${m.bg};border:1px solid ${m.bc};
                      display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">
            ${m.icon}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:${unread?900:600};color:${unread?'#fff':'#aaa'};margin-bottom:3px">
              ${n.title}
            </div>
            <div style="font-size:11px;color:#666;line-height:1.5">${n.body}</div>
            <div style="font-size:10px;color:#444;margin-top:4px">
              ${new Date(n.created_at).toLocaleDateString('th-TH', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
            </div>
          </div>
          ${unread ? '<div style="width:8px;height:8px;border-radius:50%;background:var(--gold);flex-shrink:0;margin-top:6px"></div>' : ''}
        </div>`;
    }).join('');
  } catch {
    el.innerHTML = '<div style="color:var(--red);font-size:12px;padding:10px">โหลดไม่ได้</div>';
  }
}

async function readNotif(id, el) {
  try {
    await Notif.read(id);
    el.style.borderColor = '#1e1e1e';
    el.querySelector('div:first-child')?.style && (el.style.background = 'var(--dark3)');
    const dot = el.querySelector('div:last-child');
    if (dot && dot.style.borderRadius === '50%') dot.remove();
    updateNotifBadge();
  } catch {}
}

async function markAllRead() {
  try {
    await Notif.readAll();
    toast('✅ อ่านทั้งหมดแล้ว');
    loadNotifications();
    updateNotifBadge();
  } catch (e) { toast(e.message, 'err'); }
}

async function updateNotifBadge() {
  try {
    const res = await Notif.list({ is_read: 0, limit: 1 });
    const count = res.unread_count || 0;
    const badge = document.getElementById('notifBadge');
    if (badge) {
      badge.textContent = count > 0 ? count : '';
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
  } catch {}
}
