// ============================================================
// かよママ動画アプリ app.js  (v0.2.0 - 閲覧者管理・いいね・お知らせ対応)
// ============================================================

const LS_KEY_UID    = 'kayomama_line_uid';
const LS_KEY_NAME   = 'kayomama_viewer_name';
const LS_KEY_LIKES  = 'kayomama_video_likes_v2';
const LS_KEY_SORT   = 'kayomama_video_sort';
const LS_KEY_FILTER = 'kayomama_video_filter';

const state = {
  view: 'boot',                 // boot | login | guide | list | detail | settings | notices | register
  uid: null,
  viewer: null,                 // {uid, name, email, notify, tags:[], view_count, like_count}
  videos: [],
  stats: {},                    // { no: {views, likes} }
  myLikes: new Set(),
  notices: [],
  currentVideoNo: null,
  monthFilter: 'all',
  seriesFilter: 'all',
  sort: 'newest',               // newest | popular
  showFavOnly: false
};

// ============ Boot ============
async function boot() {
  const params = new URLSearchParams(location.search);
  let uid = params.get('uid');
  const isTest = params.get('test') === '1';

  if (isTest) {
    uid = window.TEST_UID;
    localStorage.setItem(LS_KEY_UID, uid);
  } else if (uid) {
    localStorage.setItem(LS_KEY_UID, uid);
  } else {
    uid = localStorage.getItem(LS_KEY_UID) || null;
  }

  if (!uid) {
    state.view = 'guide';
    render();
    return;
  }

  state.uid = uid;
  // 閲覧者チェック
  try {
    const r = await gasGet_('check_viewer', { uid });
    if (r.ok && r.registered) {
      state.viewer = r.viewer;
      // テスト時はタグを強制付与
      if (uid === window.TEST_UID) state.viewer.tags = window.TEST_TAGS.split(',');
    } else {
      // 未登録 → 登録モーダル
      state.view = 'register';
      render();
      return;
    }
  } catch (e) {
    console.warn('check_viewer failed', e);
    // 通信失敗でもUIは表示（オフライン救済）
    state.viewer = { uid, name: localStorage.getItem(LS_KEY_NAME) || '', tags: ['サブスク'] };
  }

  await loadAll_();
  state.view = 'list';
  render();
}

async function loadAll_() {
  // 並列で3本
  const [vidRes, statsRes, likesRes, noticesRes] = await Promise.all([
    gasGet_('list_videos'),
    gasGet_('get_stats').catch(() => ({ ok:true, stats:{} })),
    gasGet_('get_user_likes', { uid: state.uid }).catch(() => ({ ok:true, likes:[] })),
    gasGet_('get_notices', { uid: state.uid }).catch(() => ({ ok:true, notices:[] }))
  ]);
  state.videos = (vidRes && vidRes.videos) || [];
  state.stats = (statsRes && statsRes.stats) || {};
  state.myLikes = new Set((likesRes && likesRes.likes) || []);
  state.notices = (noticesRes && noticesRes.notices) || [];
  // 復元
  state.sort = localStorage.getItem(LS_KEY_SORT) || 'newest';
  try {
    const f = JSON.parse(localStorage.getItem(LS_KEY_FILTER) || '{}');
    state.monthFilter = f.month || 'all';
    state.seriesFilter = f.series || 'all';
  } catch { }
}

// ============ GAS通信 ============
async function gasGet_(action, params = {}) {
  const q = new URLSearchParams({ action, token: window.GAS_TOKEN, ...params });
  const res = await fetch(window.GAS_URL + '?' + q.toString());
  return res.json();
}
async function gasPost_(action, body = {}) {
  const q = new URLSearchParams({ action, token: window.GAS_TOKEN, ...body });
  const res = await fetch(window.GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: q.toString()
  });
  return res.json();
}

// ============ タグベース閲覧制御 ============
function canView_(v) {
  const vt = (v.tags || []).filter(Boolean);
  if (vt.length === 0) return true;                   // タグ無指定 = 全員OK
  const ut = (state.viewer && state.viewer.tags) || [];
  return vt.some(t => ut.indexOf(t) >= 0);
}

// ============ Render ============
function render() {
  const el = document.getElementById('app');
  document.getElementById('modal-root').innerHTML = '';
  if (state.view === 'guide')    { el.innerHTML = renderGuide(); bindEvents(); return; }
  if (state.view === 'register') { el.innerHTML = renderRegister(); bindRegister(); return; }
  if (state.view === 'settings') { el.innerHTML = renderSettings(); bindSettings(); return; }
  if (state.view === 'notices')  { el.innerHTML = renderNotices(); bindEvents(); return; }
  if (state.view === 'detail')   { el.innerHTML = renderDetail(); bindEvents(); return; }
  el.innerHTML = renderList();
  bindEvents();
}

// ============ Views ============
function renderHeader() {
  const name = state.viewer && state.viewer.name ? state.viewer.name : '';
  const greet = name ? `${escape_(name)}さん、こんにちは♡` : 'ようこそ♡';
  return `
    <header class="hdr">
      <div class="hdr-inner">
        <h1>🌸 かよママの動画レッスン</h1>
        <p class="sub">${greet}</p>
      </div>
      <button class="hdr-btn" data-view="settings" title="設定">⚙</button>
    </header>
  `;
}

function renderNoticeBanner() {
  if (!state.notices.length) return '';
  const n = state.notices[0];
  const more = state.notices.length > 1 ? `<span class="notice-more">+${state.notices.length - 1}件</span>` : '';
  return `
    <div class="notice-banner" data-view="notices">
      <span class="notice-icon">📢</span>
      <span class="notice-title">${escape_(n.title)}</span>
      ${more}
      <span class="notice-arrow">›</span>
    </div>
  `;
}

function renderGuide() {
  return `
    <div class="guide-wrap">
      <div class="guide-card">
        <div class="guide-icon">🌸</div>
        <h1>かよママの動画レッスン</h1>
        <p class="guide-lead">こちらは<strong>かよママさんLINE会員限定</strong>のページです。</p>
        <p class="guide-body">
          動画を見るには、まず<br>
          <strong>公式LINE</strong>から専用リンクでアクセスしてください。
        </p>
        <a class="guide-btn" href="${escape_(window.LINE_ADD_URL)}" target="_blank" rel="noopener">
          📱 かよママ公式LINEを追加
        </a>
        <p class="guide-note">
          既に会員の方は、LINEに届いた動画視聴URLをタップしてお入りください。
        </p>
        <hr>
        <button class="guide-test-btn" id="test-login-btn">🧪 テストログインで入る</button>
        <p class="guide-note-small">（テスト用・全機能お試し可能）</p>
      </div>
    </div>
  `;
}

function renderRegister() {
  return `
    <div class="guide-wrap">
      <div class="guide-card">
        <div class="guide-icon">🌸</div>
        <h2>はじめまして♡</h2>
        <p class="guide-body">お名前を教えてください</p>
        <form id="register-form">
          <label class="form-lbl">お名前<span class="req">*</span></label>
          <input type="text" id="reg-name" required maxlength="30" placeholder="例：ゆかり">
          <label class="form-lbl">メールアドレス <small>（任意）</small></label>
          <input type="email" id="reg-email" placeholder="通知希望の方のみ">
          <label class="form-check">
            <input type="checkbox" id="reg-notify">
            <span>新着動画・お知らせをメールで受け取る</span>
          </label>
          <button type="submit" class="guide-btn">登録して始める</button>
        </form>
      </div>
    </div>
  `;
}

function renderSettings() {
  const v = state.viewer || {};
  return `
    ${renderHeader()}
    <main class="settings-main">
      <button class="back-btn" data-view="list">← 一覧に戻る</button>
      <h2 class="settings-title">⚙ 設定</h2>

      <div class="settings-card">
        <h3>プロフィール</h3>
        <label class="form-lbl">お名前</label>
        <input type="text" id="set-name" value="${escape_(v.name||'')}" maxlength="30">
        <label class="form-lbl">メールアドレス</label>
        <input type="email" id="set-email" value="${escape_(v.email||'')}" placeholder="任意">
        <label class="form-check">
          <input type="checkbox" id="set-notify" ${v.notify?'checked':''}>
          <span>新着動画・お知らせをメールで受け取る</span>
        </label>
        <button class="btn-recipe" id="save-profile">💾 変更を保存</button>
      </div>

      <div class="settings-card">
        <h3>ご利用状況</h3>
        <p>動画視聴数：<strong>${v.view_count||0}</strong>本</p>
        <p>いいね数：<strong>${v.like_count||0}</strong>件</p>
        <p>会員タグ：<span class="tag">${escape_((v.tags||[]).join(', ') || '未設定')}</span></p>
      </div>

      <div class="settings-card">
        <h3>その他</h3>
        <button class="btn-outline" id="btn-logout">ログアウト（UID解除）</button>
        <p class="hint">※ ログアウトすると再度LINEからのアクセスが必要です</p>
      </div>
    </main>
  `;
}

function renderNotices() {
  const html = state.notices.length
    ? state.notices.map(n => `
      <article class="notice-item">
        <p class="notice-ts">${escape_(n.timestamp)}</p>
        <h3>${escape_(n.title)}</h3>
        <p class="notice-body">${escape_(n.body).replace(/\n/g,'<br>')}</p>
      </article>
    `).join('')
    : '<div class="empty">お知らせはまだありません</div>';
  return `
    ${renderHeader()}
    <main class="main">
      <button class="back-btn" data-view="list">← 一覧に戻る</button>
      <h2 class="settings-title">📢 お知らせ</h2>
      <div class="notice-list">${html}</div>
    </main>
  `;
}

function renderList() {
  // 視聴可能な動画だけ
  const accessible = state.videos.filter(canView_);
  const months = [...new Set(accessible.map(v => v.month).filter(Boolean))];
  const series = [...new Set(accessible.map(v => v.series).filter(Boolean))];

  let filtered = accessible.filter(v => {
    if (state.monthFilter !== 'all' && v.month !== state.monthFilter) return false;
    if (state.seriesFilter !== 'all' && v.series !== state.seriesFilter) return false;
    if (state.showFavOnly && !state.myLikes.has(v.no)) return false;
    return true;
  });

  // ソート
  if (state.sort === 'popular') {
    filtered = filtered.slice().sort((a, b) => {
      const la = (state.stats[a.no] || {}).likes || 0;
      const lb = (state.stats[b.no] || {}).likes || 0;
      if (lb !== la) return lb - la;
      return (b.no || 0) - (a.no || 0);
    });
  }

  // 月ごとグループ化（人気順の場合はまとめて表示）
  let body;
  if (state.sort === 'popular' || state.showFavOnly) {
    body = filtered.length === 0
      ? `<div class="empty">該当する動画がありません</div>`
      : `<section class="month-sec"><h2 class="month-title">${state.showFavOnly ? '⭐ お気に入り' : '🔥 人気順'}</h2><div class="video-grid">${filtered.map(renderCard).join('')}</div></section>`;
  } else {
    const grouped = {};
    filtered.forEach(v => { (grouped[v.month] = grouped[v.month] || []).push(v); });
    body = Object.keys(grouped).length === 0
      ? `<div class="empty">該当する動画がありません</div>`
      : Object.keys(grouped).map(m => `
        <section class="month-sec">
          <h2 class="month-title">📅 ${escape_(m)}</h2>
          <div class="video-grid">${grouped[m].map(renderCard).join('')}</div>
        </section>
      `).join('');
  }

  return `
    ${renderHeader()}
    ${renderNoticeBanner()}
    <div class="filter-bar">
      <select id="month-filter">
        <option value="all">📆 すべての月</option>
        ${months.map(m => `<option value="${escape_(m)}" ${state.monthFilter===m?'selected':''}>${escape_(m)}</option>`).join('')}
      </select>
      ${series.length ? `
      <select id="series-filter">
        <option value="all">🌸 すべてのシリーズ</option>
        ${series.map(s => `<option value="${escape_(s)}" ${state.seriesFilter===s?'selected':''}>${escape_(s)}</option>`).join('')}
      </select>` : ''}
      <select id="sort-select">
        <option value="newest" ${state.sort==='newest'?'selected':''}>🆕 新着順</option>
        <option value="popular" ${state.sort==='popular'?'selected':''}>🔥 人気順</option>
      </select>
      <button class="fav-btn ${state.showFavOnly?'on':''}" id="toggle-fav">${state.showFavOnly?'⭐ 全部':'⭐ お気に入り'}</button>
    </div>
    <main class="main">${body}</main>
    <footer class="ftr">
      <p>🌸 かよママの動画レッスン<br><small>v${window.APP_VERSION}</small></p>
    </footer>
  `;
}

function renderCard(v) {
  const isLiked = state.myLikes.has(v.no);
  const s = state.stats[v.no] || {};
  const likes = s.likes || 0;
  const fallbackNo = (Math.abs(Number(v.no) || 1) - 1) % 5 + 1;
  return `
    <article class="card" data-video="${v.no}">
      <div class="thumb" style="--thumb-image:url('img/thumb-default-${fallbackNo}.webp')">
        <div class="thumb-inner"><span class="play-icon">▶</span></div>
        ${v.duration ? `<span class="duration">${escape_(v.duration)}</span>` : ''}
        <button class="fav ${isLiked?'on':''}" data-like="${v.no}" aria-label="いいね">${isLiked?'♥':'♡'}${likes>0?`<em>${likes}</em>`:''}</button>
      </div>
      <div class="card-body">
        <h3>${escape_(v.title)}</h3>
        <p class="meta">${escape_(v.month || '')}${v.series?' ・ '+escape_(v.series):''}</p>
      </div>
    </article>
  `;
}

function renderDetail() {
  const v = state.videos.find(x => x.no === state.currentVideoNo);
  if (!v) return renderList();
  if (!canView_(v)) {
    return `${renderHeader()}<main class="main"><button class="back-btn" data-view="list">← 一覧に戻る</button>
      <div class="empty">この動画はご視聴いただけません<br><small>会員タグをご確認ください</small></div></main>`;
  }
  const isLiked = state.myLikes.has(v.no);
  const s = state.stats[v.no] || {};
  const vimeoId = extractVimeoId_(v.vimeoUrl);
  return `
    ${renderHeader()}
    <main class="main detail-main">
      <button class="back-btn" data-view="list">← 一覧に戻る</button>
      <div class="detail">
        <div class="video-wrap">
          ${vimeoId
            ? `<iframe src="https://player.vimeo.com/video/${vimeoId}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`
            : `<div class="video-placeholder">
                 <div class="placeholder-inner">
                   <div class="placeholder-icon">🎬</div>
                   <p>動画URLを準備中...</p>
                   <p class="hint">かよママさんに「${escape_(v.title)}」を見たいとお伝えください♡</p>
                 </div>
               </div>`}
        </div>
        <div class="detail-body">
          <div class="detail-head">
            <h2>${escape_(v.title)}</h2>
            <button class="fav-lg ${isLiked?'on':''}" data-like="${v.no}">${isLiked?'♥ いいね済':'♡ いいね'}${(s.likes||0)>0?` (${s.likes})`:''}</button>
          </div>
          <p class="detail-meta">
            📅 ${escape_(v.month || '')}${v.series?' ・ 🌸 '+escape_(v.series):''}${v.duration?' ・ ⏱ '+escape_(v.duration):''}
            ${(s.views||0)>0?` ・ 👀 ${s.views}回`:''}
          </p>
          ${v.recipeUrl
            ? `<a class="btn btn-recipe" href="${escape_(v.recipeUrl)}" target="_blank" rel="noopener">📄 レシピをダウンロード</a>`
            : v.recipe
              ? `<div class="recipe-name">📄 レシピ: ${escape_(v.recipe)}<span class="hint">（PDFリンク準備中）</span></div>`
              : ''}
        </div>
      </div>
    </main>
  `;
}

function extractVimeoId_(url) {
  if (!url) return null;
  const m = String(url).match(/vimeo\.com\/(\d+)/);
  return m ? m[1] : null;
}

// ============ Events ============
function bindEvents() {
  // view切替
  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      state.view = el.dataset.view;
      render();
      window.scrollTo(0, 0);
    });
  });
  // カードクリック → 詳細
  document.querySelectorAll('.card').forEach(c => {
    c.addEventListener('click', (e) => {
      if (e.target.closest('[data-like]')) return;
      state.currentVideoNo = parseInt(c.dataset.video, 10);
      state.view = 'detail';
      window.scrollTo(0, 0);
      // 視聴ログ（非同期）
      gasPost_('log_view', { uid: state.uid, no: state.currentVideoNo }).catch(()=>{});
      render();
    });
  });
  // いいね
  document.querySelectorAll('[data-like]').forEach(b => {
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const no = parseInt(b.dataset.like, 10);
      const willLike = !state.myLikes.has(no);
      if (willLike) state.myLikes.add(no); else state.myLikes.delete(no);
      // 楽観更新
      state.stats[no] = state.stats[no] || { views:0, likes:0 };
      state.stats[no].likes = Math.max(0, (state.stats[no].likes||0) + (willLike?1:-1));
      render();
      try {
        await gasPost_('toggle_like', { uid: state.uid, no, like: String(willLike) });
      } catch { }
    });
  });
  // filters
  const mf = document.getElementById('month-filter');
  if (mf) mf.addEventListener('change', e => { state.monthFilter = e.target.value; saveFilters_(); render(); });
  const sf = document.getElementById('series-filter');
  if (sf) sf.addEventListener('change', e => { state.seriesFilter = e.target.value; saveFilters_(); render(); });
  const so = document.getElementById('sort-select');
  if (so) so.addEventListener('change', e => { state.sort = e.target.value; localStorage.setItem(LS_KEY_SORT, state.sort); render(); });
  const tf = document.getElementById('toggle-fav');
  if (tf) tf.addEventListener('click', () => { state.showFavOnly = !state.showFavOnly; render(); });
  // guide
  const tb = document.getElementById('test-login-btn');
  if (tb) tb.addEventListener('click', async () => {
    localStorage.setItem(LS_KEY_UID, window.TEST_UID);
    location.search = '?test=1';
  });
}

function bindRegister() {
  const form = document.getElementById('register-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const notify = document.getElementById('reg-notify').checked;
    if (!name) return;
    try {
      const r = await gasPost_('register_viewer', {
        uid: state.uid, name, email, notify: String(notify),
        tags: (state.uid === window.TEST_UID) ? window.TEST_TAGS : 'サブスク'
      });
      if (!r.ok) throw new Error(r.error||'unknown');
      localStorage.setItem(LS_KEY_NAME, name);
      // 再check
      const c = await gasGet_('check_viewer', { uid: state.uid });
      state.viewer = c.viewer;
      await loadAll_();
      state.view = 'list';
      render();
    } catch (err) {
      alert('登録に失敗しました：' + err.message);
    }
  });
}

function bindSettings() {
  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', () => { state.view = el.dataset.view; render(); window.scrollTo(0,0); });
  });
  document.getElementById('save-profile').addEventListener('click', async () => {
    const name = document.getElementById('set-name').value.trim();
    const email = document.getElementById('set-email').value.trim();
    const notify = document.getElementById('set-notify').checked;
    try {
      await gasPost_('update_viewer', { uid: state.uid, name, email, notify: String(notify) });
      state.viewer.name = name; state.viewer.email = email; state.viewer.notify = notify;
      localStorage.setItem(LS_KEY_NAME, name);
      alert('保存しました♡');
      render();
    } catch (err) { alert('保存失敗：'+err.message); }
  });
  document.getElementById('btn-logout').addEventListener('click', () => {
    if (!confirm('ログアウトしますか？（UIDを解除します）')) return;
    localStorage.removeItem(LS_KEY_UID);
    localStorage.removeItem(LS_KEY_NAME);
    location.href = location.pathname;
  });
}

function saveFilters_() {
  localStorage.setItem(LS_KEY_FILTER, JSON.stringify({ month: state.monthFilter, series: state.seriesFilter }));
}

function escape_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ============ Start ============
boot();
