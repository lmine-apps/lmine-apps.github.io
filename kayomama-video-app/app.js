// ============================================================
// かよママ動画アプリ app.js
// ============================================================

const state = {
  view: 'list',      // list | detail
  currentVideoNo: null,
  videos: [],
  monthFilter: 'all',
  seriesFilter: 'all',
  favorites: loadFavorites_(),
};

// ============ Boot ============
async function boot() {
  // GAS APIから取得（未実装なのでフォールバックでモック使用）
  state.videos = await fetchVideos_();
  render();
}

async function fetchVideos_() {
  try {
    const url = window.GAS_URL + '?action=list_videos&token=' + encodeURIComponent(window.GAS_TOKEN || '');
    const res = await fetch(url);
    const j = await res.json();
    if (j && j.ok && Array.isArray(j.videos) && j.videos.length) return j.videos;
  } catch (e) { console.warn('GAS fetch failed', e); }
  // フォールバック
  return window.MOCK_VIDEOS || [];
}

function loadFavorites_() {
  try { return JSON.parse(localStorage.getItem('kayomama_video_favs') || '[]'); } catch { return []; }
}
function saveFavorites_() {
  try { localStorage.setItem('kayomama_video_favs', JSON.stringify(state.favorites)); } catch {}
}
function toggleFav(no) {
  const i = state.favorites.indexOf(no);
  if (i >= 0) state.favorites.splice(i, 1);
  else state.favorites.push(no);
  saveFavorites_();
  render();
}

function getUidFromUrl_() {
  const u = new URLSearchParams(location.search).get('uid');
  if (u) try { localStorage.setItem('kayomama_line_uid', u); } catch {}
  return u || (localStorage.getItem('kayomama_line_uid') || '');
}

// ============ Render ============
function render() {
  const el = document.getElementById('app');
  if (state.view === 'detail') {
    el.innerHTML = renderDetail();
  } else {
    el.innerHTML = renderList();
  }
  bindEvents();
}

function renderHeader() {
  return `
    <header class="hdr">
      <div class="hdr-inner">
        <div>
          <h1>🌸 かよママの動画レッスン</h1>
          <p class="sub">${state.videos.length}本の動画とレシピ</p>
        </div>
      </div>
    </header>
  `;
}

function renderList() {
  const months = [...new Set(state.videos.map(v => v.month))];
  const series = [...new Set(state.videos.map(v => v.series).filter(Boolean))];
  const filtered = state.videos.filter(v => {
    if (state.monthFilter !== 'all' && v.month !== state.monthFilter) return false;
    if (state.seriesFilter !== 'all' && v.series !== state.seriesFilter) return false;
    return true;
  });

  const grouped = {};
  filtered.forEach(v => {
    if (!grouped[v.month]) grouped[v.month] = [];
    grouped[v.month].push(v);
  });

  return `
    ${renderHeader()}
    <div class="filter-bar">
      <select id="month-filter">
        <option value="all">📆 すべての月</option>
        ${months.map(m => `<option value="${escape_(m)}" ${state.monthFilter===m?'selected':''}>${escape_(m)}</option>`).join('')}
      </select>
      ${series.length ? `
      <select id="series-filter">
        <option value="all">🌸 すべてのシリーズ</option>
        ${series.map(s => `<option value="${escape_(s)}" ${state.seriesFilter===s?'selected':''}>${escape_(s)}</option>`).join('')}
      </select>
      ` : ''}
      ${state.favorites.length ? `<button class="fav-btn" id="show-favs">⭐ お気に入り(${state.favorites.length})</button>` : ''}
    </div>

    <main class="main">
      ${Object.keys(grouped).length === 0
        ? `<div class="empty">該当する動画がありません</div>`
        : Object.keys(grouped).map(month => `
        <section class="month-sec">
          <h2 class="month-title">📅 ${escape_(month)}</h2>
          <div class="video-grid">
            ${grouped[month].map(v => renderCard(v)).join('')}
          </div>
        </section>
      `).join('')}
    </main>

    <footer class="ftr">
      <p>🌸 かよママの動画レッスン<br><small>v${window.APP_VERSION}</small></p>
    </footer>
  `;
}

function renderCard(v) {
  const isFav = state.favorites.includes(v.no);
  return `
    <article class="card" data-video="${v.no}">
      <div class="thumb">
        <div class="thumb-inner">
          <span class="play-icon">▶</span>
        </div>
        <span class="duration">${escape_(v.duration || '')}</span>
        <button class="fav ${isFav?'on':''}" data-fav="${v.no}" aria-label="お気に入り">${isFav?'⭐':'☆'}</button>
      </div>
      <div class="card-body">
        <h3>${escape_(v.title)}</h3>
        <p class="meta">${escape_(v.month || '')}${v.series ? ' ・ '+escape_(v.series) : ''}</p>
      </div>
    </article>
  `;
}

function renderDetail() {
  const v = state.videos.find(x => x.no === state.currentVideoNo);
  if (!v) return renderList();
  const isFav = state.favorites.includes(v.no);
  const vimeoId = extractVimeoId_(v.vimeoUrl);

  return `
    ${renderHeader()}
    <main class="main detail-main">
      <button class="back-btn" id="back-btn">← 一覧に戻る</button>

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
               </div>`
          }
        </div>

        <div class="detail-body">
          <div class="detail-head">
            <h2>${escape_(v.title)}</h2>
            <button class="fav-lg ${isFav?'on':''}" data-fav="${v.no}">${isFav?'⭐ お気に入り':'☆ お気に入り'}</button>
          </div>
          <p class="detail-meta">
            📅 ${escape_(v.month || '')}${v.series ? ' ・ 🌸 '+escape_(v.series) : ''} ・ ⏱ ${escape_(v.duration || '')}
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
  document.querySelectorAll('.card').forEach(c => {
    c.addEventListener('click', (e) => {
      if (e.target.closest('.fav')) return;
      state.currentVideoNo = parseInt(c.dataset.video, 10);
      state.view = 'detail';
      window.scrollTo(0, 0);
      render();
    });
  });
  document.querySelectorAll('[data-fav]').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFav(parseInt(b.dataset.fav, 10));
    });
  });
  const back = document.getElementById('back-btn');
  if (back) back.addEventListener('click', () => {
    state.view = 'list';
    render();
    window.scrollTo(0, 0);
  });
  const mf = document.getElementById('month-filter');
  if (mf) mf.addEventListener('change', e => { state.monthFilter = e.target.value; render(); });
  const sf = document.getElementById('series-filter');
  if (sf) sf.addEventListener('change', e => { state.seriesFilter = e.target.value; render(); });
  const showFav = document.getElementById('show-favs');
  if (showFav) showFav.addEventListener('click', () => {
    // お気に入りだけ表示（簡易フィルタ）
    const only = state.videos.filter(v => state.favorites.includes(v.no));
    if (!only.length) return;
    document.getElementById('app').innerHTML = `
      ${renderHeader()}
      <div class="filter-bar"><button class="fav-btn" id="back-all">← 全部を表示</button></div>
      <main class="main">
        <section class="month-sec">
          <h2 class="month-title">⭐ お気に入り</h2>
          <div class="video-grid">${only.map(renderCard).join('')}</div>
        </section>
      </main>
    `;
    bindEvents();
    const b = document.getElementById('back-all');
    if (b) b.addEventListener('click', render);
  });
}

function escape_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ============ Start ============
boot();
