/**
 * TigerLotto — API Client
 * เชื่อมต่อ Backend API จริงทุก endpoint
 */

const API_BASE = window.location.origin + '/api/v1';

// ── HTTP Helper ───────────────────────────────────────────────
async function http(method, path, body = null, multipart = false) {
  const token = localStorage.getItem('tgl_token');
  const headers = {};
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (!multipart && body) headers['Content-Type'] = 'application/json';

  const opts = { method, headers };
  if (body) opts.body = multipart ? body : JSON.stringify(body);

  const res = await fetch(API_BASE + path, opts);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data.message || 'เกิดข้อผิดพลาด');
    err.code = data.error;
    err.status = res.status;
    throw err;
  }
  return data;
}

const get  = (path)        => http('GET',    path);
const post = (path, body)  => http('POST',   path, body);
const put  = (path, body)  => http('PUT',    path, body);
const del  = (path)        => http('DELETE', path);
const postForm = (path, fd) => http('POST',  path, fd, true);

// ── AUTH ──────────────────────────────────────────────────────
const Auth = {
  register:    (d) => post('/auth/register',   d),
  login:       (d) => post('/auth/login',       d),
  refresh:     (d) => post('/auth/refresh',     d),
  logout:      ()  => post('/auth/logout',      {}),
  sendOTP:     (d) => post('/auth/otp/send',    d),
  verifyOTP:   (d) => post('/auth/otp/verify',  d),
};

// ── ME ────────────────────────────────────────────────────────
const Me = {
  get:         ()    => get('/me'),
  update:      (d)   => put('/me', d),
  password:    (d)   => put('/me/password', d),
  getKYC:      ()    => get('/me/kyc'),
  submitKYC:   (fd)  => postForm('/me/kyc', fd),
  getBanks:    ()    => get('/me/banks'),
  addBank:     (d)   => post('/me/banks', d),
  setDefault:  (id)  => put(`/me/banks/${id}/default`),
  removeBank:  (id)  => del(`/me/banks/${id}`),
};

// ── WALLET ────────────────────────────────────────────────────
const Wallet = {
  get:          ()   => get('/wallet'),
  deposit:      (d)  => post('/wallet/deposit',  d),
  withdraw:     (d)  => post('/wallet/withdraw', d),
  transactions: (q)  => get('/wallet/transactions' + (q ? '?' + new URLSearchParams(q) : '')),
};

// ── LOTTERY ───────────────────────────────────────────────────
const Lottery = {
  types:    ()       => get('/lottery/types'),
  rounds:   (q)      => get('/lottery/rounds'    + (q ? '?' + new URLSearchParams(q) : '')),
  round:    (id)     => get(`/lottery/rounds/${id}`),
  result:   (id)     => get(`/lottery/rounds/${id}/result`),
  betTypes: (ltId)   => get('/lottery/bet-types?lottery_type_id=' + ltId),
  results:  (q)      => get('/lottery/results'   + (q ? '?' + new URLSearchParams(q) : '')),
};

// ── SLIPS ─────────────────────────────────────────────────────
const Slips = {
  list:   (q)        => get('/slips' + (q ? '?' + new URLSearchParams(q) : '')),
  get:    (id)       => get(`/slips/${id}`),
  create: (d)        => post('/slips', d),
  cancel: (id)       => del(`/slips/${id}`),
};

// ── NOTIFICATIONS ─────────────────────────────────────────────
const Notif = {
  list:    (q)       => get('/notifications' + (q ? '?' + new URLSearchParams(q) : '')),
  read:    (id)      => put(`/notifications/${id}/read`),
  readAll: ()        => put('/notifications/read-all'),
};

// ── PROMOTIONS ────────────────────────────────────────────────
const Promos = {
  list:  ()          => get('/promotions'),
  claim: (id)        => post(`/promotions/${id}/claim`),
};

// ── AGENT ─────────────────────────────────────────────────────
const Agent = {
  dashboard:    ()   => get('/agent/dashboard'),
  members:      (q)  => get('/agent/members'     + (q ? '?' + new URLSearchParams(q) : '')),
  subAgents:    ()   => get('/agent/sub-agents'),
  commissions:  (q)  => get('/agent/commissions' + (q ? '?' + new URLSearchParams(q) : '')),
  withdraw:     (d)  => post('/agent/withdraw-commission', d),
  referralLink: ()   => get('/agent/referral-link'),
};

// ── ADMIN ─────────────────────────────────────────────────────
const Admin = {
  dashboard:     ()       => get('/admin/dashboard'),
  users:         (q)      => get('/admin/users'        + (q ? '?' + new URLSearchParams(q) : '')),
  userStatus:    (id, d)  => put(`/admin/users/${id}/status`, d),
  transactions:  (q)      => get('/admin/transactions' + (q ? '?' + new URLSearchParams(q) : '')),
  approveWD:     (id)     => put(`/admin/transactions/${id}/approve`),
  enterResult:   (rid, d) => post(`/admin/lottery/rounds/${rid}/result`, d),
  kycList:       (q)      => get('/admin/kyc'          + (q ? '?' + new URLSearchParams(q) : '')),
  approveKYC:    (id)     => put(`/admin/kyc/${id}/approve`),
  rejectKYC:     (id, d)  => put(`/admin/kyc/${id}/reject`, d),
  hotNumbers:    (q)      => get('/admin/hot-numbers'  + (q ? '?' + new URLSearchParams(q) : '')),
  settings:      ()       => get('/admin/settings'),
  updateSetting: (k, v)   => put(`/admin/settings/${k}`, { value: v }),
  report:        (q)      => get('/admin/reports/monthly' + (q ? '?' + new URLSearchParams(q) : '')),
};

// ── Session Helpers ───────────────────────────────────────────
function saveSession(token, user, refreshToken) {
  localStorage.setItem('tgl_token', token);
  localStorage.setItem('tgl_user',  JSON.stringify(user));
  if (refreshToken) localStorage.setItem('tgl_refresh', refreshToken);
}
function getSession() {
  const token   = localStorage.getItem('tgl_token');
  const refresh = localStorage.getItem('tgl_refresh');
  const user    = JSON.parse(localStorage.getItem('tgl_user') || 'null');
  return { token, refresh, user };
}
function clearSession() {
  localStorage.removeItem('tgl_token');
  localStorage.removeItem('tgl_user');
  localStorage.removeItem('tgl_refresh');
}

// Auto-refresh token on 401
const _origHttp = http;
async function httpWithRefresh(method, path, body, multipart) {
  try {
    return await _origHttp(method, path, body, multipart);
  } catch(err) {
    if (err.status === 401 && path !== '/auth/refresh' && path !== '/auth/login') {
      const rf = localStorage.getItem('tgl_refresh');
      if (rf) {
        try {
          const res = await _origHttp('POST', '/auth/refresh', { refresh_token: rf });
          localStorage.setItem('tgl_token', res.token);
          return await _origHttp(method, path, body, multipart);
        } catch { clearSession(); window.location.reload(); }
      }
    }
    throw err;
  }
}
function isLoggedIn() {
  return !!localStorage.getItem('tgl_token');
}
