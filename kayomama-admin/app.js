// ============================================================
// かよママ管理アプリ app.js (v1.1: 先行予約→関心リスト)
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getMessaging, getToken, onMessage } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging.js';

// ============ State ============
const state = {
  tab: 'dashboard',   // dashboard | users | interests | videos | settings
  videoSubTab: 'viewers', // viewers | stats | notices
  stats: null,
  users: null,
  interests: null,
  viewers: null,       // v1.2: 視聴アプリ閲覧者
  videoStats: null,    // v1.2: 動画別視聴/いいね
  notices: null,       // v1.2: お知らせ管理
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
  const [s, u, i, vw, vs, nt] = await Promise.all([
    callGas('admin_stats'),
    callGas('admin_list_users'),
    callGas('admin_list_interests'),
    callGas('admin_list_viewers'),
    callGas('admin_video_stats'),
    callGas('admin_list_notices')
  ]);
  state.stats = (s && s.ok) ? s.stats : null;
  state.users = (u && u.ok) ? u.users : [];
  state.interests = (i && i.ok) ? i.interests : [];
  state.viewers = (vw && vw.ok) ? vw.viewers : [];
  state.videoStats = (vs && vs.ok) ? vs.videos : [];
  state.notices = (nt && nt.ok) ? nt.notices : [];
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
      state.tab === 'videos'    ? renderVideos() :
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
      <div class="hdr-actions">
        <a class="refresh-btn hdr-video-btn" href="../kayomama-video-app/" title="視聴アプリへ">🎬 視聴</a>
        <button class="refresh-btn" id="refresh">↻ 更新</button>
      </div>
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
      <button data-tab="videos" class="${state.tab === 'videos' ? 'active' : ''}">
        <span class="ico">🎬</span>動画
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

// ============ Videos (v1.2) ============
function renderVideos() {
  const sub = state.videoSubTab || 'viewers';
  const viewers = state.viewers || [];
  const stats = state.videoStats || [];
  const notices = state.notices || [];
  const totalViews = stats.reduce((s, v) => s + (v.views || 0), 0);
  const totalLikes = stats.reduce((s, v) => s + (v.likes || 0), 0);
  return `
    <div class="video-subtabs">
      <button data-vsub="viewers" class="${sub==='viewers'?'active':''}">👥 閲覧者(${viewers.length})</button>
      <button data-vsub="stats"   class="${sub==='stats'?'active':''}">📊 動画分析</button>
      <button data-vsub="notices" class="${sub==='notices'?'active':''}">📢 お知らせ(${notices.length})</button>
    </div>
    ${sub === 'viewers' ? renderVideoViewers_(viewers) : ''}
    ${sub === 'stats'   ? renderVideoStatsList_(stats, totalViews, totalLikes) : ''}
    ${sub === 'notices' ? renderVideoNotices_(notices) : ''}
  `;
}

function renderVideoViewers_(viewers) {
  if (!viewers.length) return '<div class="empty">まだ閲覧者はいません<br><small>LINE→視聴アプリに入った方がここに表示されます</small></div>';
  const sorted = viewers.slice().sort((a, b) => (b.view_count||0) - (a.view_count||0));
  return sorted.map(v => {
    const primary = v.line_name || v.name || '（名前未設定）';
    const sub = (v.line_name && v.name && v.line_name !== v.name) ? ` <small style="color:#999">（自己申告: ${escape_(v.name)}）</small>` : '';
    return `
    <div class="list-item" data-viewer-uid="${escape_(v.uid)}">
      <p class="name">${escape_(primary)}${sub} <span class="badge badge-inprogress">${v.view_count||0}本視聴</span> <span class="badge">${v.like_count||0}♥</span></p>
      <p class="type">${escape_(v.tags || '未設定')}${v.email?' ・ '+escape_(v.email):''}</p>
      <p class="meta">登録 ${escape_(v.created_at || '-')} ・ 最終 ${escape_(v.last_access || '-')}</p>
    </div>
  `;
  }).join('');
}

function renderVideoStatsList_(stats, totalViews, totalLikes) {
  if (!stats.length) return '<div class="empty">動画データがありません</div>';
  const byViews = stats.slice().sort((a,b)=>(b.views||0)-(a.views||0));
  const byLikes = stats.slice().sort((a,b)=>(b.likes||0)-(a.likes||0));
  return `
    <div class="stat-grid">
      <div class="stat-card"><p class="num">${totalViews}</p><p class="lbl">総視聴数</p></div>
      <div class="stat-card"><p class="num">${totalLikes}</p><p class="lbl">総いいね数</p></div>
      <div class="stat-card"><p class="num">${stats.length}</p><p class="lbl">動画数</p></div>
    </div>
    <div class="funnel-box">
      <h3>👀 視聴数ランキング TOP10</h3>
      ${byViews.slice(0, 10).map((v,i) => `
        <div class="funnel-row">
          <span class="lbl">${i+1}位. ${escape_(v.title || '')}</span>
          <span class="num">${v.views||0}回</span>
        </div>
      `).join('')}
    </div>
    <div class="funnel-box">
      <h3>♥ いいね数ランキング TOP10</h3>
      ${byLikes.slice(0, 10).map((v,i) => `
        <div class="funnel-row">
          <span class="lbl">${i+1}位. ${escape_(v.title || '')}</span>
          <span class="num">${v.likes||0}♥</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderVideoNotices_(notices) {
  return `
    <button class="refresh-btn" id="btn-new-notice" style="display:block; margin:8px auto 16px; padding: 10px 24px;">＋ 新しいお知らせを投稿</button>
    ${notices.length ? notices.map(n => `
      <div class="list-item" data-notice-id="${escape_(n.id)}">
        <p class="name">${escape_(n.title)} <span class="badge ${n.status==='公開'?'badge-closed':'badge-cancel'}">${escape_(n.status)}</span></p>
        <p class="type">${escape_(n.body).substring(0, 60)}${n.body.length>60?'...':''}</p>
        <p class="meta">${escape_(n.timestamp)}${n.target_tags?' ・ 対象: '+escape_(n.target_tags):''}</p>
      </div>
    `).join('') : '<div class="empty">まだお知らせがありません</div>'}
  `;
}

function openNoticeCreateModal_() {
  showModal(`
    <button class="close" data-close>×</button>
    <h3>📢 お知らせを投稿</h3>
    <div class="field"><label>タイトル<span style="color:#d94040">*</span></label>
      <input id="nt-title" type="text" placeholder="例：9月新作動画アップしました♡" maxlength="60">
    </div>
    <div class="field"><label>本文<span style="color:#d94040">*</span></label>
      <textarea id="nt-body" rows="5" placeholder="お知らせ本文（改行OK）"></textarea>
    </div>
    <div class="field"><label>対象タグ <small>（空欄=全員）</small></label>
      <input id="nt-tags" type="text" placeholder="例：サブスク,無料　※カンマ区切り">
    </div>
    <div class="field"><label>公開状態</label>
      <select id="nt-status">
        <option value="公開">公開</option>
        <option value="下書き">下書き</option>
      </select>
    </div>
    <button class="refresh-btn" id="nt-submit" style="display:block; margin:16px auto; padding: 12px 32px;">投稿する</button>
  `);
  document.getElementById('nt-submit').addEventListener('click', async () => {
    const title = document.getElementById('nt-title').value.trim();
    const body = document.getElementById('nt-body').value.trim();
    const target_tags = document.getElementById('nt-tags').value.trim();
    const status = document.getElementById('nt-status').value;
    if (!title || !body) { showToast('タイトルと本文は必須です'); return; }
    showLoading();
    const r = await callGas('admin_post_notice', { title, body, target_tags, status });
    hideLoading();
    if (r && r.ok) {
      showToast('投稿しました♡');
      closeModal();
      await refreshAll(); render();
    } else {
      showToast('投稿失敗：' + (r && r.error || 'unknown'));
    }
  });
}

async function deleteNotice_(id) {
  if (!confirm('このお知らせを削除しますか？')) return;
  showLoading();
  const r = await callGas('admin_delete_notice', { id });
  hideLoading();
  if (r && r.ok) { showToast('削除しました'); await refreshAll(); render(); }
  else showToast('削除失敗');
}

function openViewerModal_(uid) {
  const v = (state.viewers || []).find(x => String(x.uid) === String(uid));
  if (!v) return;
  showModal(`
    <button class="close" data-close>×</button>
    <h3>${escape_(v.line_name || v.name || '（名前未設定）')}</h3>
    <div class="field"><label>UID</label><div class="val" style="font-family: monospace; font-size: 12px;">${escape_(v.uid)}</div></div>
    <div class="field"><label>LINE表示名</label><div class="val">${escape_(v.line_name||'（未取得）')}</div></div>
    <div class="field"><label>自己申告名</label><input id="vw-name" type="text" value="${escape_(v.name||'')}" maxlength="30"></div>
    <div class="field"><label>メール</label><input id="vw-email" type="email" value="${escape_(v.email||'')}"></div>
    <div class="field"><label>通知希望</label>
      <label style="display:flex; align-items:center; gap:8px; padding: 8px 0;">
        <input id="vw-notify" type="checkbox" ${v.notify?'checked':''}> メール通知を送る
      </label>
    </div>
    <div class="field"><label>タグ<small>（カンマ区切り）</small></label>
      <input id="vw-tags" type="text" value="${escape_(v.tags||'')}" placeholder="例：サブスク,無料">
    </div>
    <div class="field"><label>視聴数 / いいね数</label>
      <div class="val">${v.view_count||0}本 ・ ${v.like_count||0}♥</div>
    </div>
    <div class="field"><label>登録日 / 最終アクセス</label>
      <div class="val">${escape_(v.created_at||'-')} / ${escape_(v.last_access||'-')}</div>
    </div>
    <button class="refresh-btn" id="vw-save" style="display:block; margin:16px auto; padding:12px 32px;">💾 保存</button>
  `);
  document.getElementById('vw-save').addEventListener('click', async () => {
    const name = document.getElementById('vw-name').value.trim();
    const email = document.getElementById('vw-email').value.trim();
    const notify = document.getElementById('vw-notify').checked;
    const tags = document.getElementById('vw-tags').value.trim();
    showLoading();
    const r = await callGas('admin_update_viewer', { uid, name, email, notify: String(notify), tags });
    hideLoading();
    if (r && r.ok) { showToast('保存しました'); closeModal(); await refreshAll(); render(); }
    else showToast('保存失敗');
  });
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

  // v1.2: 動画タブ
  document.querySelectorAll('[data-vsub]').forEach(b => {
    b.addEventListener('click', () => { state.videoSubTab = b.dataset.vsub; render(); });
  });
  document.querySelectorAll('[data-viewer-uid]').forEach(el => {
    el.addEventListener('click', () => openViewerModal_(el.dataset.viewerUid));
  });
  const nn = document.getElementById('btn-new-notice');
  if (nn) nn.addEventListener('click', openNoticeCreateModal_);
  document.querySelectorAll('[data-notice-id]').forEach(el => {
    el.addEventListener('click', () => deleteNotice_(el.dataset.noticeId));
  });
}

// ============ Start ============
boot();
