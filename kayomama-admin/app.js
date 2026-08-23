// ============================================================
// かよママ管理アプリ app.js (v1.1: 先行予約→関心リスト)
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getMessaging, getToken, onMessage } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging.js';

// ============ State ============
const state = {
  tab: 'dashboard',   // dashboard | users | interests | settings
  stats: null,
  users: null,
  interests: null,
  loading: false,
  fcmToken: null,
  authed: false,
};

const LS_TOKEN = 'kayomama_admin_token';

const INTEREST_STATUSES = ['新規', 'LINE連絡済', '対応中', '成約', '見送り'];

// ============ Boot ============
async function boot() {
  const urlToken = new URLSearchParams(location.search).get('t');
  if (urlToken) {
    localStorage.setItem(LS_TOKEN, urlToken);
    history.replaceState({}, '', location.pathname);
  }
  const saved = localStorage.getItem(LS_TOKEN);
  if (saved) window.ADMIN_TOKEN = saved;

  const t = window.ADMIN_TOKEN || '';
  if (!t || t.indexOf('ここに') === 0) {
    renderAuth();
    return;
  }
  state.authed = true;
  // FCM初期化はバックグラウンドで（await しない → 通知許可ダイアログ待ちで画面止まらない）
  initFCM().catch(e => console.warn('FCM init failed', e));
  await refreshAll();
  render();
}

// ============ Auth ============
function renderAuth(errMsg) {
  const el = document.getElementById('app');
  el.innerHTML = `
    <div class="auth-screen">
      <h2>🌸 かよママ管理アプリ</h2>
      <p>初回設定：管理トークンを入力してください</p>
      <input id="tok-input" type="text" placeholder="admin-xxxxxxxxxxxxxxxxxxxxx" autocomplete="off">
      ${errMsg ? `<div class="err">${errMsg}</div>` : ''}
      <button id="tok-submit">保存して開始</button>
    </div>
  `;
  document.getElementById('tok-submit').addEventListener('click', async () => {
    const v = document.getElementById('tok-input').value.trim();
    if (!v) return;
    const r = await callGas('admin_stats', { admin_token: v });
    if (!r || !r.ok) {
      renderAuth('トークンが正しくないみたい💦 もう一度確認してね');
      return;
    }
    localStorage.setItem(LS_TOKEN, v);
    window.ADMIN_TOKEN = v;
    state.authed = true;
    initFCM().catch(e => console.warn('FCM init failed', e));
    await refreshAll();
    render();
  });
}

// ============ FCM ============
async function initFCM() {
  try {
    const app = initializeApp(window.FIREBASE_CONFIG);
    const messaging = getMessaging(app);
    const swReg = await navigator.serviceWorker.register('firebase-messaging-sw.js');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      console.warn('通知が許可されませんでした');
      return;
    }
    const token = await getToken(messaging, {
      vapidKey: window.FCM_VAPID_KEY,
      serviceWorkerRegistration: swReg
    });
    if (token) {
      state.fcmToken = token;
      const saved = localStorage.getItem('kayomama_admin_fcm_saved');
      if (saved !== token) {
        const r = await callGas('admin_register_token', { fcm_token: token });
        if (r && r.ok) localStorage.setItem('kayomama_admin_fcm_saved', token);
      }
    }
    onMessage(messaging, (payload) => {
      const n = payload.notification || {};
      showToast(`🔔 ${n.title || ''}`);
      refreshAll().then(render);
    });
  } catch (e) {
    console.warn('FCM init failed', e);
  }
}

// ============ API ============
async function callGas(action, extra) {
  const params = new URLSearchParams();
  params.set('action', action);
  const isAdmin = action.indexOf('admin_') === 0;
  if (isAdmin) {
    params.set('admin_token', (extra && extra.admin_token) || window.ADMIN_TOKEN);
  }
  for (const k in (extra || {})) {
    if (k === 'admin_token') continue;
    params.set(k, extra[k]);
  }
  try {
    const url = window.GAS_URL + '?' + params.toString();
    const res = await fetch(url, { method: 'GET' });
    return await res.json();
  } catch (e) {
    console.warn('callGas error', e);
    return null;
  }
}

async function refreshAll() {
  state.loading = true;
  render();
  const [s, u, i] = await Promise.all([
    callGas('admin_stats'),
    callGas('admin_list_users'),
    callGas('admin_list_interests')
  ]);
  state.stats = (s && s.ok) ? s.stats : null;
  state.users = (u && u.ok) ? u.users : [];
  state.interests = (i && i.ok) ? i.interests : [];
  state.loading = false;
}

// ============ Render ============
function render() {
  if (!state.authed) return;
  const el = document.getElementById('app');
  el.innerHTML = `
    ${renderHeader()}
    ${state.loading ? '<div class="loading">読み込み中...</div>' :
      state.tab === 'dashboard' ? renderDashboard() :
      state.tab === 'users'     ? renderUsers() :
      state.tab === 'interests' ? renderInterests() :
      state.tab === 'settings'  ? renderSettings() : ''}
    ${renderTabs()}
  `;
  bindEvents();
}

function renderHeader() {
  const now = new Date();
  const t = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  return `
    <div class="hdr">
      <div>
        <h1>🌸 かよママ管理</h1>
        <div class="subttl">更新 ${t}</div>
      </div>
      <button class="refresh-btn" id="refresh">↻ 更新</button>
    </div>
  `;
}

function renderTabs() {
  const newInt = (state.interests || []).filter(r => r.status === '新規').length;
  return `
    <div class="tabs">
      <button data-tab="dashboard" class="${state.tab === 'dashboard' ? 'active' : ''}">
        <span class="ico">📊</span>ホーム
      </button>
      <button data-tab="users" class="${state.tab === 'users' ? 'active' : ''}">
        <span class="ico">👥</span>受講者
      </button>
      <button data-tab="interests" class="${state.tab === 'interests' ? 'active' : ''} ${newInt > 0 ? 'badge' : ''}">
        <span class="ico">💬</span>関心${newInt > 0 ? '(' + newInt + ')' : ''}
      </button>
      <button data-tab="settings" class="${state.tab === 'settings' ? 'active' : ''}">
        <span class="ico">⚙️</span>設定
      </button>
    </div>
  `;
}

// ============ Dashboard ============
function renderDashboard() {
  const s = state.stats;
  if (!s) return '<div class="empty">データがまだありません</div>';
  const newInt = (state.interests || []).filter(r => r.status === '新規').length;
  return `
    <div class="stat-grid">
      <div class="stat-card big ${newInt > 0 ? 'alert' : ''}">
        <p class="num">💬 ${s.interests_new}</p>
        <p class="lbl">未対応の関心表明</p>
      </div>
      <div class="stat-card">
        <p class="num">${s.total}</p>
        <p class="lbl">登録ユーザー</p>
      </div>
      <div class="stat-card">
        <p class="num">${s.started}</p>
        <p class="lbl">アプリ開始済</p>
      </div>
    </div>

    <div class="funnel-box">
      <h3>📈 進捗ファネル</h3>
      <div class="funnel-row"><span class="lbl">診断完了</span><span class="num">${s.diagnosed} 人</span></div>
      <div class="funnel-row"><span class="lbl">アプリ開始</span><span class="num">${s.started} 人</span></div>
      <div class="funnel-row"><span class="lbl">1日目完了</span><span class="num">${s.day1} 人</span></div>
      <div class="funnel-row"><span class="lbl">2日目完了</span><span class="num">${s.day2} 人</span></div>
      <div class="funnel-row"><span class="lbl">3日目完了</span><span class="num">${s.day3} 人</span></div>
      <div class="funnel-row"><span class="lbl">4日目完了</span><span class="num">${s.day4} 人</span></div>
      <div class="funnel-row"><span class="lbl">レポート閲覧</span><span class="num">${s.report_viewed} 人</span></div>
      <div class="funnel-row"><span class="lbl">オファー閲覧</span><span class="num">${s.offer_viewed} 人</span></div>
      <div class="funnel-row"><span class="lbl">オファークリック</span><span class="num">${s.offer_clicked} 人</span></div>
      <div class="funnel-row"><span class="lbl">💬 関心表明 (合計)</span><span class="num">${s.interests} 件</span></div>
    </div>
  `;
}

// ============ Users ============
function renderUsers() {
  const list = state.users || [];
  if (!list.length) return '<div class="empty">まだ受講者がいません</div>';
  return list.map(u => `
    <div class="list-item" data-uid="${u.uid}">
      <p class="name">${escape_(u.name || '（名前未設定）')}</p>
      <p class="type">${escape_(u.type_display || '')}</p>
      <p class="meta">${escape_(u.status || '')}｜最終 ${escape_(u.last_event_at || '-')}</p>
    </div>
  `).join('');
}

// ============ Interests ============
function renderInterests() {
  const list = state.interests || [];
  if (!list.length) return '<div class="empty">まだ関心表明はありません</div>';
  return `
    <div class="info-note" style="background:#fff5f7; padding:10px 12px; border-radius:8px; font-size:12px; color:#666; margin-bottom:10px;">
      💡 コピーしたメッセージがLINEに届いてるはずです。かよママさんはそちらで対応→ここでステータス更新してください♡
    </div>
  ` + list.map(r => `
    <div class="list-item" data-int-row="${r.row}">
      <p class="name">${escape_(r.service_label)} <span class="badge ${badgeClass_(r.status)}">${escape_(r.status)}</span></p>
      <p class="type">${escape_(r.name || '（名前未設定）')}｜${escape_(r.type_display)}</p>
      <p class="meta">${escape_(r.expressed_at)}</p>
    </div>
  `).join('');
}

function badgeClass_(status) {
  if (status === '新規')       return 'badge-new';
  if (status === 'LINE連絡済') return 'badge-contacted';
  if (status === '対応中')     return 'badge-inprogress';
  if (status === '成約')       return 'badge-closed';
  if (status === '見送り')     return 'badge-cancel';
  return '';
}

// ============ Settings ============
function renderSettings() {
  const t = window.ADMIN_TOKEN || '';
  const masked = t.length > 8 ? t.slice(0, 8) + '...' + t.slice(-4) : t;
  return `
    <div class="funnel-box">
      <h3>⚙️ 設定</h3>
      <div class="funnel-row">
        <span class="lbl">管理トークン</span>
        <span class="num" style="font-family: monospace; font-size: 12px;">${masked}</span>
      </div>
      <div class="funnel-row">
        <span class="lbl">通知トークン</span>
        <span class="num">${state.fcmToken ? '登録済 ✅' : '未登録'}</span>
      </div>
    </div>
    <button class="refresh-btn" id="test-push" style="display:block; margin: 12px auto; padding: 10px 20px;">
      🔔 テスト通知を送る
    </button>
    <button class="refresh-btn" id="reauth" style="display:block; margin: 12px auto; padding: 10px 20px; border-color: #f5c5c5; color: #a44;">
      ログアウト（トークン削除）
    </button>
    <div class="empty" style="padding: 20px;">
      v${window.APP_VERSION}
    </div>
  `;
}

// ============ Modal ============
async function openUserModal(uid) {
  showLoading();
  const r = await callGas('admin_get_user', { uid: uid });
  hideLoading();
  if (!r || !r.ok || !r.user) return showToast('取得できませんでした');
  const u = r.user;
  const evs = r.events || [];
  showModal(`
    <button class="close" data-close>×</button>
    <h3>${escape_(u.name || '（名前未設定）')}</h3>
    <div class="field"><label>タイプ</label><div class="val">${escape_(u.type_display)}</div></div>
    <div class="field"><label>ステータス</label><div class="val">${escape_(u.status)}</div></div>
    <div class="field"><label>UID</label><div class="val" style="font-family: monospace; font-size: 12px;">${escape_(u.uid)}</div></div>
    <div class="field"><label>進捗</label><div class="val">
      診断: ${escape_(u.diagnosis_at || '-')}<br>
      開始: ${escape_(u.app_started_at || '-')}<br>
      1日目: ${escape_(u.day1_at || '-')}<br>
      2日目: ${escape_(u.day2_at || '-')}<br>
      3日目: ${escape_(u.day3_at || '-')}<br>
      4日目: ${escape_(u.day4_at || '-')}<br>
      レポ閲覧: ${escape_(u.report_viewed_at || '-')}<br>
      オファー閲覧: ${escape_(u.offer_viewed_at || '-')}<br>
      オファークリック: ${escape_(u.offer_clicked_at || '-')}<br>
      期限: ${escape_(u.expired_at || '-')}
    </div></div>
    <div class="field"><label>イベント履歴（最新100件）</label>
      <div class="event-log">
        ${evs.length ? evs.map(e => `
          <div class="ev">
            <span class="at">${escape_(e.at)}</span>
            <span class="ev-name">${escape_(e.event)}</span>
          </div>
        `).join('') : '<div style="color:#bbb; padding: 10px;">履歴なし</div>'}
      </div>
    </div>
  `);
}

async function openInterestModal(row) {
  const int = (state.interests || []).find(r => String(r.row) === String(row));
  if (!int) return;
  const statusBtns = INTEREST_STATUSES.map(s => `
    <button class="${s === int.status ? 'btn-primary' : 'btn-sub'}" data-int-status="${s}" data-int-row="${int.row}">${s}</button>
  `).join('');
  showModal(`
    <button class="close" data-close>×</button>
    <h3>💬 関心表明の詳細</h3>
    <div class="field"><label>サービス</label><div class="val">${escape_(int.service_label)}</div></div>
    <div class="field"><label>お名前</label><div class="val">${escape_(int.name || '（名前未設定）')}</div></div>
    <div class="field"><label>タイプ</label><div class="val">${escape_(int.type_display)}</div></div>
    <div class="field"><label>表明日時</label><div class="val">${escape_(int.expressed_at)}</div></div>
    <div class="field"><label>LINEに届いてるはずのメッセージ</label>
      <div class="val" style="background:#fff5f7; padding:10px; border-radius:8px; font-weight:600;">「${escape_(int.message)}」</div>
    </div>
    <div class="field"><label>UID</label><div class="val" style="font-family: monospace; font-size: 11px; word-break: break-all;">${escape_(int.uid)}</div></div>
    <div class="field"><label>ステータス</label>
      <div class="status-btn-row">${statusBtns}</div>
    </div>
    <div class="field"><label>メモ</label>
      <textarea id="int-memo" style="width: 100%; min-height: 60px; padding: 8px; border-radius: 8px; border: 1px solid #ddd;">${escape_(int.memo || '')}</textarea>
    </div>
    <div class="actions">
      <button class="btn-sub" data-close>閉じる</button>
      <button class="btn-primary" data-save-memo data-int-row="${int.row}">メモ保存</button>
    </div>
  `);
}

async function updateInterestStatus(row, status) {
  const memoEl = document.getElementById('int-memo');
  const memo = memoEl ? memoEl.value : '';
  showLoading();
  const r = await callGas('admin_update_interest', { row: row, status: status, memo: memo });
  hideLoading();
  if (r && r.ok) {
    showToast(`「${status}」に更新しました`);
    await refreshAll();
    render();
    // モーダル閉じる
    closeModal();
  } else {
    showToast('更新失敗');
  }
}

async function saveInterestMemo(row) {
  const memoEl = document.getElementById('int-memo');
  if (!memoEl) return;
  showLoading();
  const r = await callGas('admin_update_interest', { row: row, memo: memoEl.value });
  hideLoading();
  if (r && r.ok) {
    showToast('メモを保存しました');
    await refreshAll();
    render();
    closeModal();
  } else {
    showToast('保存失敗');
  }
}

// ============ UI Helpers ============
function showModal(html) {
  let ov = document.getElementById('modal-ov');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'modal-ov';
    ov.className = 'modal-overlay';
    document.body.appendChild(ov);
  }
  ov.innerHTML = `<div class="modal">${html}</div>`;
  ov.addEventListener('click', (e) => {
    if (e.target === ov) closeModal();
  });
  ov.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModal));
  ov.querySelectorAll('[data-int-status]').forEach(b => {
    b.addEventListener('click', () => {
      updateInterestStatus(b.dataset.intRow, b.dataset.intStatus);
    });
  });
  ov.querySelectorAll('[data-save-memo]').forEach(b => {
    b.addEventListener('click', () => saveInterestMemo(b.dataset.intRow));
  });
}
function closeModal() {
  const ov = document.getElementById('modal-ov');
  if (ov) ov.remove();
}
function showLoading() {
  let l = document.getElementById('gl-load');
  if (l) return;
  l = document.createElement('div');
  l.id = 'gl-load';
  l.className = 'modal-overlay';
  l.style.background = 'rgba(255,255,255,0.6)';
  l.innerHTML = '<div class="loading" style="margin: auto;">処理中...</div>';
  l.style.alignItems = 'center';
  document.body.appendChild(l);
}
function hideLoading() {
  const l = document.getElementById('gl-load');
  if (l) l.remove();
}
function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}
function escape_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ============ Events ============
function bindEvents() {
  document.querySelectorAll('.tabs button').forEach(b => {
    b.addEventListener('click', () => {
      state.tab = b.dataset.tab;
      render();
    });
  });
  const rb = document.getElementById('refresh');
  if (rb) rb.addEventListener('click', async () => {
    await refreshAll();
    render();
    showToast('更新しました');
  });
  document.querySelectorAll('[data-uid]').forEach(el => {
    el.addEventListener('click', () => openUserModal(el.dataset.uid));
  });
  document.querySelectorAll('[data-int-row]').forEach(el => {
    if (el.tagName === 'DIV') {
      el.addEventListener('click', () => openInterestModal(el.dataset.intRow));
    }
  });
  const tp = document.getElementById('test-push');
  if (tp) tp.addEventListener('click', async () => {
    const r = await callGas('admin_test_push', {
      title: '🔔 テスト通知',
      body: 'GASからちゃんと届いてます♡'
    });
    showToast(r && r.ok ? '送信しました。数秒待って通知確認' : '送信失敗');
  });
  const ra = document.getElementById('reauth');
  if (ra) ra.addEventListener('click', () => {
    if (!confirm('ログアウトしますか？（再度トークン入力が必要になります）')) return;
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem('kayomama_admin_fcm_saved');
    location.reload();
  });
}

// ============ Start ============
boot();
