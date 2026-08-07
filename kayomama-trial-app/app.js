/**
 * ============================================================
 * かよママさん「あなたの台所を軽くする4日間」
 * app.js — コアロジックと画面レンダリング
 * ============================================================
 */

(function () {
  'use strict';

  var CFG = window.APP_CONFIG || {};
  var COMMON = window.COMMON_CONTENT || {};
  var TYPES = window.TYPE_CONTENT || {};

  // ------------------------------------------------------------
  // ユーティリティ
  // ------------------------------------------------------------
  var VALID_TYPES = ['A', 'B', 'C', 'D'];

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        if (k === 'className') e.className = attrs[k];
        else if (k === 'html') e.innerHTML = attrs[k];
        else if (k === 'text') e.textContent = attrs[k];
        else if (k === 'onclick') e.addEventListener('click', attrs[k]);
        else if (k.indexOf('data-') === 0) e.setAttribute(k, attrs[k]);
        else e.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      children.forEach(function (c) {
        if (c == null) return;
        if (typeof c === 'string') e.appendChild(document.createTextNode(c));
        else e.appendChild(c);
      });
    }
    return e;
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function nowIso() { return new Date().toISOString(); }

  function hoursFromNow(iso) {
    if (!iso) return 0;
    var t = new Date(iso).getTime();
    return (Date.now() - t) / 3600000;
  }

  function getQueryParam(name) {
    var m = window.location.search.match(new RegExp('[?&]' + name + '=([^&]+)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function isTestMode() { return CFG.testMode === true; }
  function isDebugMode() {
    return getQueryParam('debug') === '1';
  }

  function unlockIntervalMs() {
    return isTestMode()
      ? (CFG.testUnlockIntervalMinutes || 1) * 60 * 1000
      : (CFG.unlockIntervalHours || 24) * 3600 * 1000;
  }
  function appAvailableMs() {
    return isTestMode()
      ? (CFG.testAppAvailableMinutes || 10) * 60 * 1000
      : (CFG.appAvailableHours || 120) * 3600 * 1000;
  }

  // ------------------------------------------------------------
  // ストレージ
  // ------------------------------------------------------------
  var STORAGE_KEY = CFG.storageKey || 'kayomama_trial_v2';

  function hasStorage() {
    try {
      window.localStorage.setItem('__t', '1');
      window.localStorage.removeItem('__t');
      return true;
    } catch (e) {
      return false;
    }
  }

  function defaultState() {
    return {
      version: 2,
      assignedType: null,
      name: '',                 // ★お名前（入力してもらう）
      startedAt: '',
      lastVisitedAt: '',
      completedDays: { day1: false, day2: false, day3: false, day4: false },
      answers: { day1: {}, day2: {}, day3: {}, day4: {} },
      cardCreated: false,
      reportGenerated: false,
      reportViewed: false,
      offerViewed: false,
      offerClicked: false,
      diagnosisRecorded: false
    };
  }

  var state = defaultState();

  // メモリ上だけで保持するpendingType（URLから拾ったが、まだ開始してないtype）
  var pendingType = null;

  function loadState() {
    if (!hasStorage()) return false;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return false;
      // versionチェック
      if (parsed.version !== 2) {
        // 旧version → 破棄して初期化
        localStorage.removeItem(STORAGE_KEY);
        return false;
      }
      state = Object.assign(defaultState(), parsed);
      state.completedDays = Object.assign(defaultState().completedDays, parsed.completedDays || {});
      state.answers = {
        day1: (parsed.answers && parsed.answers.day1) || {},
        day2: (parsed.answers && parsed.answers.day2) || {},
        day3: (parsed.answers && parsed.answers.day3) || {},
        day4: (parsed.answers && parsed.answers.day4) || {}
      };
      // 旧データ互換：reportViewed が存在しない場合は false
      if (typeof state.reportViewed !== 'boolean') state.reportViewed = false;
      return true;
    } catch (e) {
      console.warn('loadState error', e);
      return false;
    }
  }

  function saveState() {
    if (!hasStorage()) return;
    state.lastVisitedAt = nowIso();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('saveState error', e);
    }
  }

  function resetState() {
    if (hasStorage()) localStorage.removeItem(STORAGE_KEY);
    state = defaultState();
    pendingType = null;
  }

  // ------------------------------------------------------------
  // タイプ判定
  // ------------------------------------------------------------
  // 返り値：
  //   { type, source: 'saved' | 'pending' | 'none', mismatch: boolean }
  //   - saved  : localStorage に開始済みタイプ（assignedType && startedAt）あり
  //   - pending: 開始前で、URLから拾ったタイプをメモリ保持
  //   - none   : どちらも無効
  //   mismatch : 開始後に別タイプURLでアクセスされた
  function resolveType() {
    var urlType = getQueryParam('type');
    var validUrlType = urlType && VALID_TYPES.indexOf(urlType) >= 0 ? urlType : null;

    // 開始後（startedAt有り）：assignedTypeを絶対優先、URLでは上書きしない
    if (state.startedAt && state.assignedType && VALID_TYPES.indexOf(state.assignedType) >= 0) {
      return {
        type: state.assignedType,
        source: 'saved',
        mismatch: !!(validUrlType && validUrlType !== state.assignedType)
      };
    }

    // 開始前：URLの新しいタイプで pendingType を更新（別タイプURLで開き直せる）
    if (validUrlType) {
      pendingType = validUrlType;
      return { type: validUrlType, source: 'pending', mismatch: false };
    }

    // 開始前でURLも無効：pendingTypeが残っていればそれを使う
    if (pendingType && VALID_TYPES.indexOf(pendingType) >= 0) {
      return { type: pendingType, source: 'pending', mismatch: false };
    }

    return { type: null, source: 'none', mismatch: false };
  }

  // 現在表示すべきタイプ（assignedType があれば優先、無ければ pendingType）
  function currentType() {
    if (state.assignedType && VALID_TYPES.indexOf(state.assignedType) >= 0) return state.assignedType;
    if (pendingType && VALID_TYPES.indexOf(pendingType) >= 0) return pendingType;
    return null;
  }

  // ------------------------------------------------------------
  // 解放判定
  // ------------------------------------------------------------
  function isExpired() {
    if (!state.startedAt) return false;
    var elapsedMs = Date.now() - new Date(state.startedAt).getTime();
    return elapsedMs >= appAvailableMs();
  }

  function getDayUnlockAt(dayN) {
    // 1日目：開始時刻
    // Nの日：開始時刻 + (N-1) * interval
    if (!state.startedAt) return null;
    var start = new Date(state.startedAt).getTime();
    var interval = unlockIntervalMs();
    return new Date(start + (dayN - 1) * interval);
  }

  // dayNが「時間的に」解放されているか（前日完了は考慮しない）
  function isDayTimeUnlocked(dayN) {
    if (dayN === 1) return !!state.startedAt;
    var unlockAt = getDayUnlockAt(dayN);
    if (!unlockAt) return false;
    return Date.now() >= unlockAt.getTime();
  }

  // dayNが完全に解放されているか（時間経過 AND 前日完了）
  function isDayUnlocked(dayN) {
    if (!isDayTimeUnlocked(dayN)) return false;
    if (dayN === 1) return true;
    // 2〜4日目：前日が完了していなければNG
    return !!state.completedDays['day' + (dayN - 1)];
  }

  // 解放されていない理由：'time'（時間未経過）／'prev'（前日未完了）／null（解放済み）
  function whyLocked(dayN) {
    if (isDayUnlocked(dayN)) return null;
    if (!isDayTimeUnlocked(dayN)) return 'time';
    return 'prev';
  }

  function hoursUntilUnlock(dayN) {
    var unlockAt = getDayUnlockAt(dayN);
    if (!unlockAt) return null;
    var ms = unlockAt.getTime() - Date.now();
    if (ms <= 0) return 0;
    return Math.ceil(ms / 3600000);
  }

  // 進捗5工程（day1〜day4 完了＋レポート閲覧）。診断完了は分子・分母に含めない。
  function completedCount() {
    var c = 0;
    ['day1','day2','day3','day4'].forEach(function (k) {
      if (state.completedDays[k]) c++;
    });
    if (state.reportViewed) c++;
    return c;
  }

  // ------------------------------------------------------------
  // イベント（console + GAS Web App への POST 送信）
  // ------------------------------------------------------------
  function trackEvent(eventName, payload) {
    payload = payload || {};
    if (!payload.type) payload.type = state.assignedType;
    console.log('[event]', eventName, payload);
    // GAS Web Appへ非同期送信（uidが取れてる場合のみ）
    sendToGas_('record_event', {
      uid:     getLineUid(),
      type:    state.assignedType || '',
      name:    state.name || '',    // ★お名前も同送
      event:   eventName,
      payload: payload
    });
  }

  // ------------------------------------------------------------
  // LINE uid の取得（URL ?uid= を優先、localStorage にも保存して再訪時対応）
  // ------------------------------------------------------------
  var LINE_UID_STORAGE_KEY = 'kayomama_line_uid';
  function getLineUid() {
    var q = getQueryParam('uid');
    if (q) {
      try { localStorage.setItem(LINE_UID_STORAGE_KEY, q); } catch (e) {}
      return q;
    }
    try { return localStorage.getItem(LINE_UID_STORAGE_KEY) || ''; } catch (e) { return ''; }
  }

  // ------------------------------------------------------------
  // GAS Web App 呼出し（fetch, POST, JSONボディ）
  //   ・ CFG.gasWebhookUrl 未設定なら何もしない（開発時オフ）
  //   ・ uid 未取得なら何もしない
  //   ・ 失敗しても throw しない（fire-and-forget）
  // ------------------------------------------------------------
  function sendToGas_(action, params) {
    var url = CFG.gasWebhookUrl;
    if (!url || !String(url).trim()) return Promise.resolve(null);
    if (!params || !params.uid) return Promise.resolve(null);
    var body = Object.assign({ token: CFG.gasToken || '', action: action }, params);
    try {
      return fetch(url, {
        method: 'POST',
        // ContentType:'application/json' にすると preflight で弾かれるため text/plain で送る（GAS側で JSON.parse する）
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
        mode: 'cors',
        credentials: 'omit'
      }).then(function (res) {
        return res.json().catch(function () { return null; });
      }).then(function (json) {
        if (json && json.ok === false) console.warn('[gas]', action, 'err:', json.error);
        return json;
      }).catch(function (e) {
        console.warn('[gas] fetch error:', e && e.message);
        return null;
      });
    } catch (e) {
      console.warn('[gas] send error:', e && e.message);
      return Promise.resolve(null);
    }
  }

  // ------------------------------------------------------------
  // GAS からタイプを引き当てる（bootstrap時、uid付きURLで起動された時のみ）
  //   ・成功すると type を返し、state.assignedType が空なら埋める
  //   ・失敗（uid未登録・未診断・通信エラー）は null を返す
  // ------------------------------------------------------------
  function fetchTypeFromGas_() {
    var uid = getLineUid();
    if (!uid) return Promise.resolve(null);
    var url = CFG.gasWebhookUrl;
    if (!url) return Promise.resolve(null);
    var qs = 'action=get_type&token=' + encodeURIComponent(CFG.gasToken || '') + '&uid=' + encodeURIComponent(uid);
    return fetch(url + '?' + qs, { method: 'GET', mode: 'cors', credentials: 'omit' })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json && json.ok && json.type && VALID_TYPES.indexOf(json.type) >= 0) {
          return json.type;
        }
        return null;
      })
      .catch(function () { return null; });
  }

  // ------------------------------------------------------------
  // 画面ルーティング
  // ------------------------------------------------------------
  var currentScreen = null;

  function goto(screenName, opts) {
    opts = opts || {};
    if (currentScreen === screenName && !opts.force) return;
    currentScreen = screenName;
    render();
    // 先頭スクロール（初回描画では抑制）
    if (opts.scrollTop !== false) {
      setTimeout(function () { window.scrollTo(0, 0); }, 0);
    }
  }

  // 起点：初期表示
  function bootstrap() {
    if (!hasStorage()) {
      renderStorageError();
      return;
    }
    loadState();

    // URLに uid はあるが type がない or 保存済み type もない場合、GASから type を引き当てる
    var needsGasLookup = getLineUid() && !getQueryParam('type') && !state.assignedType;
    if (needsGasLookup) {
      fetchTypeFromGas_().then(function (t) {
        if (t && VALID_TYPES.indexOf(t) >= 0) {
          // GASから取得できたタイプを pendingType にセット（開始前）or assignedType にセット（既に開始済み）
          if (state.startedAt && !state.assignedType) {
            state.assignedType = t;
            saveState();
          } else {
            pendingType = t;
          }
        }
        proceedBootstrap_();
      });
      return;
    }

    proceedBootstrap_();
  }

  function proceedBootstrap_() {
    var t = resolveType();
    // ここでは assignedType には触らない（開始ボタン押下時に startApp() で確定）

    if (!t.type) {
      goto('invalid-type', { scrollTop: false });
      if (isDebugMode()) renderDebugBar();
      return;
    }
    if (t.mismatch) {
      // 開始後に別タイプURLで来た → 既存の続き画面
      goto('already-started', { scrollTop: false });
      if (isDebugMode()) renderDebugBar();
      return;
    }

    // 初回登録：uid付きURLで開かれた かつ 診断イベント未記録なら fire
    //  （LP側で送信済みなら二重記録になるが GAS 側で冪等ガード）
    if (getLineUid() && !state.diagnosisRecorded) {
      trackEvent('diagnosis_complete', { source: 'app_first_load', urlType: getQueryParam('type') || '' });
      state.diagnosisRecorded = true;
      saveState();
    }

    // 導線：
    //   1. 未開始 → welcome（詳細結果・お名前不要でサクッと閲覧）
    //   2. 開始済み & 名前未入力 → name-input（改善意思表明後のコミット）
    //   3. 開始済み & 名前入力済み → home（4日間チャレンジ本体）
    if (!state.startedAt) {
      goto('welcome', { scrollTop: false });
    } else if (!state.name) {
      goto('name-input', { scrollTop: false });
    } else {
      goto('home', { scrollTop: false });
    }
    if (isDebugMode()) renderDebugBar();
  }

  // ------------------------------------------------------------
  // レンダラー本体
  // ------------------------------------------------------------
  function render() {
    var app = $('#app');
    if (!app) return;
    app.innerHTML = '';

    switch (currentScreen) {
      case 'name-input': renderNameInput(app); break;
      case 'welcome': renderWelcome(app); break;
      case 'check-line': renderCheckLine(app); break;
      case 'home': renderHome(app); break;
      case 'day1': renderDay(app, 1); break;
      case 'day2': renderDay(app, 2); break;
      case 'day3': renderDay(app, 3); break;
      case 'day4': renderDay(app, 4); break;
      case 'card': renderCard(app); break;
      case 'report': renderReport(app); break;
      case 'offer': renderOffer(app); break;
      case 'expired': renderExpired(app); break;
      case 'already-started': renderAlreadyStarted(app); break;
      case 'invalid-type': renderInvalidType(app); break;
      default: renderHome(app);
    }
  }

  // ============================================================
  // お名前入力画面（改善意思表明後・4日間チャレンジのコミット）
  //   welcome → 改善したい！ → check-line → LINE → 戻ってきたら ここ
  // ============================================================
  function renderNameInput(root) {
    var ct = currentType();
    var t = TYPES[ct];
    if (!t) return renderInvalidType(root);

    var screen = el('section', { className: 'screen active' });

    screen.appendChild(el('div', { className: 'eyebrow', text: '— START YOUR CHALLENGE —' }));
    screen.appendChild(el('h1', {
      className: 'page-title serif',
      html: 'その意気です♡<br>4日間、一緒に<br>始めましょう✨'
    }));
    screen.appendChild(el('hr', { className: 'divider' }));

    var card = el('div', { className: 'card card-lg' });
    card.appendChild(el('div', {
      className: 'page-body text-center',
      html:
        'これから4日間、朝ここに<br>' +
        '「今日も頑張ってね♡」の<br>' +
        'メッセージが届きますね。<br><br>' +
        'まずは <strong>お名前</strong> を<br>教えてもらえますか？<br><br>' +
        '<span style="font-size:12.5px;color:var(--muted);">（お名前で呼ばせていただきますね♪）</span>',
      style: 'white-space:normal;'
    }));
    screen.appendChild(card);

    // 入力フォーム
    var formWrap = el('div', { className: 'field', style: 'margin-top:14px;' });
    formWrap.appendChild(el('label', { className: 'input-label', text: 'お名前（ニックネームでもOK）' }));
    var input = el('input', {
      type: 'text',
      className: 'input',
      placeholder: 'たとえば「はなこ」',
      value: state.name || '',
      maxlength: '40',
      autocomplete: 'name',
      'data-vkey': 'name-input'
    });
    formWrap.appendChild(input);
    screen.appendChild(formWrap);

    // 送信ボタン
    var btnRow = el('div', { className: 'text-center mt-lg' });
    var submitBtn = el('button', {
      type: 'button',
      className: 'btn btn-primary btn-block',
      text: 'この名前で始める！'
    });
    btnRow.appendChild(submitBtn);
    screen.appendChild(btnRow);

    // エラー表示エリア（初期は空）
    var errWrap = el('div', {
      className: 'text-center',
      style: 'min-height:24px; margin-top:10px; color:#B84D3A; font-size:13px;'
    });
    screen.appendChild(errWrap);

    root.appendChild(screen);

    // 送信処理
    submitBtn.addEventListener('click', function () {
      var v = String(input.value || '').trim();
      if (!v) {
        errWrap.textContent = 'お名前を入力してから進んでくださいね';
        input.focus();
        return;
      }
      state.name = v;
      saveState();
      trackEvent('name_registered', { name: v });
      goto('home');
    });

    // Enterキーで送信
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitBtn.click();
      }
    });

    // 自動フォーカス（モバイル配慮：アニメーション後に）
    setTimeout(function () {
      try { input.focus(); } catch (e) {}
    }, 300);
  }

  // ============================================================
  // ウェルカム画面
  // ============================================================
  function renderWelcome(root) {
    var ct = currentType();
    var t = TYPES[ct];
    if (!t) return renderInvalidType(root);

    trackEvent('app_viewed', { type: ct });

    var screen = el('section', { className: 'screen active' });

    // ---------- ①診断結果ヘッダー ----------
    screen.appendChild(el('div', { className: 'eyebrow', text: '— YOUR RESULT —' }));
    // 名前入り挨拶（あれば）
    if (state.name) {
      screen.appendChild(el('div', {
        className: 'page-body text-center',
        html: escapeHtml(state.name) + ' さん、<br>ようこそ♡',
        style: 'font-size:15px; color:var(--muted); margin-bottom:14px;'
      }));
    }
    // 表示名（かよママ世界観に合わせて）
    var displayName = el('h1', {
      className: 'page-title serif',
      html: 'あなたのタイプは<br>「' + escapeHtml(t.displayName) + '」'
    });
    screen.appendChild(displayName);
    // 分割線
    screen.appendChild(el('hr', { className: 'divider' }));

    // ---------- ②詳細結果 + アドバイス（welcomeDetailed が定義されてる場合） ----------
    var wd = t.welcomeDetailed;
    if (wd) {
      // 「あなたの結果」
      var resultCard = el('div', { className: 'card card-lg' });
      resultCard.appendChild(el('div', {
        className: 'eyebrow',
        text: '— ' + (wd.resultTitle || 'あなたの結果') + ' —',
        style: 'margin-bottom:10px;'
      }));
      resultCard.appendChild(el('div', {
        className: 'page-body',
        text: wd.resultBody,
        style: 'white-space:pre-line;'
      }));
      screen.appendChild(resultCard);

      // 「そうなってしまう理由」
      if (wd.whyBody) {
        var whyCard = el('div', { className: 'card card-lg' });
        whyCard.appendChild(el('div', {
          className: 'eyebrow',
          text: '— ' + (wd.whyTitle || 'そうなってしまう理由') + ' —',
          style: 'margin-bottom:10px;'
        }));
        whyCard.appendChild(el('div', {
          className: 'page-body',
          text: wd.whyBody,
          style: 'white-space:pre-line;'
        }));
        screen.appendChild(whyCard);
      }

      // 「改善のための小さな一歩」
      var adviceCard = el('div', { className: 'card card-lg card-primary' });
      adviceCard.appendChild(el('div', {
        className: 'eyebrow',
        text: '— ' + (wd.adviceTitle || '改善のための小さな一歩') + ' —',
        style: 'margin-bottom:10px;'
      }));
      adviceCard.appendChild(el('div', {
        className: 'page-body',
        text: wd.adviceBody,
        style: 'white-space:pre-line;'
      }));
      screen.appendChild(adviceCard);
    } else {
      // フォールバック（旧shortバージョン）
      screen.appendChild(el('div', {
        className: 'page-body text-center mb-md',
        text: t.intro
      }));
      var body = el('div', { className: 'card' });
      body.appendChild(el('div', {
        className: 'page-body',
        text: COMMON.welcomeBody
      }));
      screen.appendChild(body);
    }

    // ---------- ③動画（設定されていれば） ----------
    if (CFG.welcomeVideoUrl && CFG.welcomeVideoUrl.trim()) {
      var videoTitle = el('div', {
        className: 'eyebrow mb-sm',
        text: COMMON.welcomeVideoTitle
      });
      videoTitle.style.marginTop = '18px';
      screen.appendChild(videoTitle);
      var videoWrap = el('div', { className: 'video-wrap' });
      var isYouTube = /youtube\.com|youtu\.be/.test(CFG.welcomeVideoUrl);
      if (isYouTube) {
        var iframe = el('iframe', {
          src: CFG.welcomeVideoUrl,
          allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
          allowfullscreen: 'allowfullscreen'
        });
        videoWrap.appendChild(iframe);
      } else {
        var vid = el('video', { controls: 'controls', playsinline: 'playsinline' });
        var src = el('source', { src: CFG.welcomeVideoUrl, type: 'video/mp4' });
        vid.appendChild(src);
        videoWrap.appendChild(vid);
      }
      screen.appendChild(videoWrap);
    }

    // ---------- ④【ハードル下げカード】改善への一歩を後押し ----------
    var hurdleCard = el('div', {
      className: 'card',
      style: 'text-align:center; background:#FFF8EC; border:1px dashed var(--gold); margin-top:22px;'
    });
    hurdleCard.appendChild(el('div', {
      className: 'eyebrow',
      text: '— 気楽に、4日だけ —',
      style: 'margin-bottom:12px; color:var(--gold);'
    }));
    hurdleCard.appendChild(el('div', {
      className: 'page-body',
      html:
        '✔ <strong>1日たった3分</strong>ほど<br>' +
        '✔ 朝ここに<strong>タップだけ</strong>で始められる<br>' +
        '✔ <strong>4日だけ</strong>やってみるだけ<br><br>' +
        '<span style="font-size:13px;color:var(--muted);">合わなかったらいつでもやめてOK。<br>まずは "とりあえず" で試してみませんか？</span>',
      style: 'white-space:normal; font-size:14px; line-height:1.9;'
    }));
    screen.appendChild(hurdleCard);

    // ⑤ 改善へのボタン（ハードル下げカードの直後）
    var btnRow = el('div', { className: 'text-center mt-md' });
    var btnText = (wd && wd.ctaText) || COMMON.startBtn;
    var btn = el('button', {
      className: 'btn btn-primary btn-block',
      type: 'button',
      onclick: startApp,
      text: btnText
    });
    btnRow.appendChild(btn);
    screen.appendChild(btnRow);

    // 補足：さらに軽く
    screen.appendChild(el('div', {
      className: 'page-body text-center mt-md',
      text: '押しても、まだ迷えます♪',
      style: 'font-size:12px; color:var(--muted);'
    }));

    root.appendChild(screen);
  }

  // ============================================================
  // 「LINE確認してね」画面（staged animation）
  //   「改善したい！」押下直後に表示。
  //   4段階のアニメーションで、まるでかよママが準備してくれてるような演出。
  //   同時に GAS→call-beacon で LINEに「小さな一歩、始まります」メッセージ配信。
  // ============================================================
  function renderCheckLine(root) {
    var screen = el('section', { className: 'screen active check-line-screen' });
    var stageBox = el('div', { className: 'stage-box' });
    screen.appendChild(stageBox);
    root.appendChild(screen);

    var stages = [
      {
        html: 'ですよね！',
        subHtml: '',
        dur: 1500
      },
      {
        html: 'その意気です♡',
        subHtml: '',
        dur: 1500
      },
      {
        html: 'ちょっと待っててくださいね<br>準備しますね！',
        subHtml: '',
        progress: true,
        dur: 3800
      },
      {
        html: '準備できましたっ✨',
        subHtml:
          'LINEにご案内を<br>お届けしましたので<br>' +
          'まずはタップして<br>確認してみてくださいね♡',
        final: true,
        dur: 0
      }
    ];

    var idx = 0;
    function showStage() {
      if (idx >= stages.length) return;
      var s = stages[idx];

      // フェードアウト → 内容差し替え → フェードイン
      stageBox.classList.remove('stage-fade-in');
      stageBox.classList.add('stage-fade-out');

      setTimeout(function () {
        stageBox.innerHTML = '';
        stageBox.classList.remove('stage-fade-out');

        // メインテキスト
        var main = el('h1', {
          className: 'page-title serif stage-main-text',
          html: s.html
        });
        stageBox.appendChild(main);

        // プログレスバー（stage 3 のみ）
        if (s.progress) {
          var pOuter = el('div', { className: 'stage-progress-outer' });
          var pInner = el('div', { className: 'stage-progress-inner' });
          pOuter.appendChild(pInner);
          stageBox.appendChild(pOuter);
          // 準備中の遊びメッセージをローテーション
          var subText = el('div', { className: 'stage-sub-text' });
          stageBox.appendChild(subText);
          var funLines = [
            'エプロンをつけてます...',
            'レシピを準備してます...',
            'あなたに合わせて調整中...',
            'もうすぐです✨'
          ];
          var fi = 0;
          subText.textContent = funLines[0];
          var funInterval = setInterval(function () {
            fi++;
            if (fi >= funLines.length) { clearInterval(funInterval); return; }
            subText.style.opacity = 0;
            setTimeout(function () {
              subText.textContent = funLines[fi];
              subText.style.opacity = 1;
            }, 200);
          }, 900);
          // プログレスバーを段階的に伸ばす
          setTimeout(function () { pInner.style.width = '100%'; }, 100);
        }

        // 補足テキスト
        if (s.subHtml) {
          stageBox.appendChild(el('div', {
            className: 'stage-sub-text stage-final-sub',
            html: s.subHtml
          }));
        }

        // 最終ステージ：LINEボタン
        if (s.final) {
          var lineBtnRow = el('div', { className: 'text-center', style: 'margin-top:28px;' });
          var lineBtn = el('a', {
            className: 'btn btn-primary btn-block',
            href: 'https://line.me/R/',
            target: '_blank',
            rel: 'noopener',
            text: 'LINEを開く'
          });
          lineBtnRow.appendChild(lineBtn);
          stageBox.appendChild(lineBtnRow);

          var subLink = el('div', {
            className: 'text-center',
            style: 'padding-top:14px;'
          });
          var homeLink = el('button', {
            className: 'btn btn-ghost',
            type: 'button',
            onclick: function () {
              // 名前未入力なら name-input へ、それ以外は home
              if (!state.name) goto('name-input');
              else goto('home');
            },
            text: '→ こちらから続きへ進む'
          });
          subLink.appendChild(homeLink);
          stageBox.appendChild(subLink);
        }

        // フェードイン
        void stageBox.offsetWidth; // reflow
        stageBox.classList.add('stage-fade-in');

        idx++;
        if (!s.final) {
          setTimeout(showStage, s.dur);
        }
      }, 300); // フェードアウト時間
    }

    // 最初のステージだけ即表示（フェードアウト飛ばす）
    setTimeout(function () {
      var s = stages[idx];
      stageBox.appendChild(el('h1', {
        className: 'page-title serif stage-main-text',
        html: s.html
      }));
      stageBox.classList.add('stage-fade-in');
      idx++;
      setTimeout(showStage, s.dur);
    }, 50);
  }

  function startApp() {
    if (state.startedAt) {
      // 二重防止：すでに開始済みなら home へ
      goto('home');
      return;
    }
    // ここで初めて pendingType を assignedType に確定
    var ct = currentType();
    if (!ct || VALID_TYPES.indexOf(ct) < 0) {
      goto('invalid-type');
      return;
    }
    state.assignedType = ct;
    state.startedAt = nowIso();
    saveState();
    pendingType = null;
    trackEvent('app_started', { type: state.assignedType });
    // 「LINE確認してね」画面へ（すぐhomeではなく、LINEに続きが届いたことを伝える）
    goto('check-line');
  }

  // ============================================================
  // ホーム画面
  // ============================================================
  function renderHome(root) {
    var t = TYPES[state.assignedType];
    if (!t) return renderInvalidType(root);

    if (isExpired()) {
      return renderExpired(root, true);
    }

    var screen = el('section', { className: 'screen active' });

    // Header
    var header = el('div', { className: 'home-header' });
    header.appendChild(el('div', {
      className: 'home-title',
      text: CFG.appTitle || 'あなたの台所を軽くする4日間'
    }));
    header.appendChild(el('div', {
      className: 'home-persona serif',
      text: t.displayName
    }));
    header.appendChild(el('div', {
      className: 'home-message',
      text: t.themeIntro || ''
    }));
    screen.appendChild(header);

    // Progress bar
    var cnt = completedCount();
    var pct = Math.round((cnt / 5) * 100);
    var prog = el('div', { className: 'progress-bar-wrap' });
    var meta = el('div', { className: 'progress-meta' });
    meta.appendChild(el('span', { text: (COMMON.progressLabel || '進捗') }));
    meta.appendChild(el('span', { text: cnt + ' / 5 完了' }));
    prog.appendChild(meta);
    var barOut = el('div', { className: 'progress-bar-outer' });
    var barIn = el('div', { className: 'progress-bar-inner' });
    barIn.style.width = pct + '%';
    barOut.appendChild(barIn);
    prog.appendChild(barOut);
    screen.appendChild(prog);

    // Day list
    var list = el('ul', { className: 'day-list' });

    // 診断完了
    list.appendChild(makeDayItem({
      label: COMMON.diagnosisDone || '診断完了　✓',
      sub: '',
      badge: '',
      state: 'completed',
      onclick: null
    }));

    // Days 1-4
    for (var i = 1; i <= 4; i++) {
      var key = 'day' + i;
      var completed = state.completedDays[key];
      var unlocked = isDayUnlocked(i);
      var lockReason = whyLocked(i);
      var todayCandidate = !completed && unlocked;

      var subText = '';
      var badgeText = '';
      var st = 'locked';
      if (completed) {
        st = 'completed';
        badgeText = 'ふりかえる';
      } else if (unlocked) {
        st = todayCandidate ? 'today' : '';
        badgeText = 'はじめる →';
      } else {
        st = 'locked';
        if (lockReason === 'prev') {
          subText = COMMON.lockedByPrevDay || '前の日を終えると開きます';
        } else {
          var h = hoursUntilUnlock(i);
          if (h == null) {
            subText = COMMON.lockedDayLabel || 'まだ開いていません';
          } else if (h <= 12) {
            subText = (COMMON.unlockedHoursTemplate || 'あと約{h}時間で開きます').replace('{h}', h);
          } else {
            subText = COMMON.unlockedTomorrow || '明日、開きます';
          }
        }
        badgeText = '';
      }

      list.appendChild(makeDayItem({
        label: i + '日目',
        sub: subText,
        badge: badgeText,
        state: st,
        onclick: (unlocked || completed) ? (function (dayN) {
          return function () { goto('day' + dayN); };
        })(i) : null
      }));
    }

    // レポート
    var reportUnlocked = state.completedDays.day4;
    list.appendChild(makeDayItem({
      label: COMMON.reportLinkLabel || 'あなたの台所レポート',
      sub: reportUnlocked ? '' : '4日目を完了すると開きます',
      badge: reportUnlocked ? (state.reportViewed ? 'ふりかえる' : (state.reportGenerated ? 'ひらく →' : '見に行く →')) : '',
      state: reportUnlocked ? (state.reportViewed ? 'completed' : '') : 'locked',
      onclick: reportUnlocked ? function () { goto('report'); } : null
    }));

    screen.appendChild(list);

    // カードへのリンク（3日目完了以降）
    if (state.cardCreated) {
      var cardLinkWrap = el('div', { className: 'text-center', style: 'padding: 6px 0 18px;' });
      var cardLink = el('button', {
        className: 'btn btn-secondary',
        type: 'button',
        onclick: function () { goto('card'); },
        text: COMMON.cardLinkLabel || 'うちの定番カード'
      });
      cardLinkWrap.appendChild(cardLink);
      screen.appendChild(cardLinkWrap);
    }

    // 【重要】ホーム画面にコース直リンクは出さない（仕様1）。
    // オファーへは「4日間完了→レポート→続きの案内」経由でのみ到達する。

    root.appendChild(screen);
  }

  function makeDayItem(opts) {
    var li = el('li', {
      className: 'day-item' + (opts.state ? ' ' + opts.state : '')
    });
    var main = el('div', { className: 'day-item-main' });
    main.appendChild(el('div', { className: 'day-item-label', text: opts.label }));
    if (opts.sub) main.appendChild(el('div', { className: 'day-item-sub', text: opts.sub }));
    li.appendChild(main);
    if (opts.badge) {
      li.appendChild(el('div', { className: 'day-item-badge', text: opts.badge }));
    }
    if (opts.onclick) {
      li.addEventListener('click', opts.onclick);
      li.setAttribute('role', 'button');
      li.setAttribute('tabindex', '0');
      li.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onclick(); }
      });
    }
    return li;
  }

  // ============================================================
  // 各日画面（1〜4）
  // ============================================================
  function renderDay(root, dayN) {
    var t = TYPES[state.assignedType];
    if (!t) return renderInvalidType(root);

    if (isExpired()) return renderExpired(root, true);
    // 完了済みの日は再閲覧可能。未完了かつ解放されていなければホームへ。
    if (!isDayUnlocked(dayN) && !state.completedDays['day' + dayN]) {
      goto('home'); return;
    }

    var dayKey = 'day' + dayN;
    var content = t[dayKey];
    var isDay4 = dayN === 4;

    var screen = el('section', { className: 'screen day-screen active' });

    var back = el('button', {
      type: 'button', className: 'back-link',
      onclick: function () { goto('home'); },
      text: 'ホームへ戻る'
    });
    screen.appendChild(back);

    screen.appendChild(el('div', { className: 'day-theme', text: dayN + '日目 / ' + (isDay4 ? COMMON.day4Heading : content.theme) }));
    screen.appendChild(el('h2', {
      className: 'page-title',
      text: isDay4 ? COMMON.day4Heading : content.theme
    }));

    if (!isDay4 && content.body) {
      screen.appendChild(el('div', {
        className: 'page-body text-center mb-lg',
        text: content.body
      }));
    }

    // 質問カード
    var card = el('div', { className: 'card card-lg' });

    if (isDay4) {
      renderDay4Content(card, t);
    } else if (dayN === 3) {
      renderDay3Content(card, t);
    } else {
      renderDayQuestions(card, t, dayN);
    }

    screen.appendChild(card);

    // 完了ボタン
    var btnWrap = el('div', { className: 'text-center mt-lg' });
    var completeBtn = el('button', {
      className: 'btn btn-primary btn-block',
      type: 'button',
      text: state.completedDays[dayKey] ? '保存する' : (isDay4 ? '振り返りを終える' : '今日はここまで')
    });
    btnWrap.appendChild(completeBtn);
    screen.appendChild(btnWrap);

    // 完了メッセージ枠
    var msgWrap = el('div', {
      className: 'day-complete-msg',
      style: 'display:none;'
    });
    screen.appendChild(msgWrap);

    root.appendChild(screen);

    // 完了処理
    completeBtn.addEventListener('click', function () {
      if (completeBtn.dataset.busy === '1') return;
      completeBtn.dataset.busy = '1';

      // 保存
      autoSaveDayInputs(dayN, t);

      // 共通バリデーション（必須未回答なら停止＋インラインエラー）
      var vres = validateDay(dayN, t, screen);
      if (!vres.ok) {
        completeBtn.dataset.busy = '';
        // 最初の未回答要素へスクロール＆フォーカス
        if (vres.firstEl) {
          try {
            vres.firstEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } catch (e) { vres.firstEl.scrollIntoView(); }
          setTimeout(function () {
            try { vres.firstEl.focus({ preventScroll: true }); } catch (e) {}
          }, 400);
        }
        return;
      }

      if (dayN === 3) {
        state.cardCreated = true;
        trackEvent('card_created', {});
      }

      state.completedDays[dayKey] = true;
      saveState();
      trackEvent(dayKey + '_completed', {});

      if (isDay4) {
        // Day4 → レポート生成 → レポート画面
        showLoading(COMMON.day4LoadingText || 'あなたの台所レポートを作っています', 1000);
        setTimeout(function () {
          state.reportGenerated = true;
          saveState();
          trackEvent('report_generated', {});
          hideLoading();
          goto('report');
        }, 1000);
        return;
      }

      // 完了メッセージ
      var msg = content.complete || '';
      if (msg) {
        msgWrap.textContent = msg;
        msgWrap.style.display = 'block';
      }
      // 少し余韻を持たせてホームへ
      setTimeout(function () {
        completeBtn.dataset.busy = '';
        goto('home');
      }, 1400);
    });
  }

  // ------------------------------------------------------------
  // バリデーション（通常利用者向け・alertを使わずインラインエラー表示）
  // ------------------------------------------------------------
  function clearInlineErrors(root) {
    $$('.inline-error', root).forEach(function (n) { n.remove(); });
    $$('.has-error', root).forEach(function (n) { n.classList.remove('has-error'); });
  }
  function makeInlineError(text) {
    return el('div', { className: 'inline-error', text: text });
  }

  function validateDay(dayN, t, screen) {
    clearInlineErrors(screen);
    var dayKey = 'day' + dayN;
    var content = t[dayKey] || {};
    var answers = state.answers[dayKey] || {};
    var firstErrorEl = null;
    var ok = true;

    function fail(anchorEl, msg) {
      ok = false;
      if (!anchorEl) return;
      anchorEl.classList.add('has-error');
      // 質問カード直下にエラーを表示
      var err = makeInlineError(msg);
      anchorEl.parentNode.insertBefore(err, anchorEl.nextSibling);
      if (!firstErrorEl) firstErrorEl = anchorEl;
    }

    // 4日目：共通3設問（q1, q2, q3）必須
    if (dayN === 4) {
      var q1El = $('[data-vkey="day4_q1"]', screen);
      if (!answers.q1) fail(q1El, COMMON.errorSingleChoice || 'ひとつ選んでから進んでください');
      var q2El = $('[data-vkey="day4_q2"]', screen);
      if (!answers.q2) fail(q2El, COMMON.errorSingleChoice || 'ひとつ選んでから進んでください');
      var q3El = $('[data-vkey="day4_q3"]', screen);
      if (!answers.q3) fail(q3El, COMMON.errorSingleChoice || 'ひとつ選んでから進んでください');
      return { ok: ok, firstEl: firstErrorEl };
    }

    // 3日目：カード自動生成のため、明示的なrequiredはなし（前日完了で担保済み）
    if (dayN === 3) {
      return { ok: true, firstEl: null };
    }

    // 1・2日目：questions を required に沿って検証
    (content.questions || []).forEach(function (q) {
      if (!q.required) return;
      var val = answers[q.key];
      var wrapEl = $('[data-vkey="' + dayKey + '_' + q.key + '"]', screen);

      // "今日は料理をしなかった" が選ばれた場合はaltを検証
      if (content.altQuestion && val === content.altQuestion.trigger) {
        var altVal = answers[content.altQuestion.key];
        var altEl = $('[data-vkey="' + dayKey + '_' + content.altQuestion.key + '"]', screen);
        if (!altVal || !String(altVal).trim()) {
          fail(altEl || wrapEl, COMMON.errorTextInput || 'こちらを入力してから進んでください');
        }
        return;
      }

      if (q.type === 'single_choice' || q.type === 'single_choice_with_other') {
        if (!val) {
          fail(wrapEl, COMMON.errorSingleChoice || 'ひとつ選んでから進んでください');
          return;
        }
        if (q.type === 'single_choice_with_other' && val === 'その他') {
          var oval = answers[q.otherKey];
          if (!oval || !String(oval).trim()) {
            fail(wrapEl, COMMON.errorOtherDetail || '「その他」の内容を入力してから進んでください');
          }
        }
      } else if (q.type === 'text_with_suggestions' || q.type === 'text_optional') {
        if (!val || !String(val).trim()) {
          fail(wrapEl, COMMON.errorTextInput || 'こちらを入力してから進んでください');
        }
      } else if (q.type === 'three_slots_with_suggestions') {
        var arr = Array.isArray(val) ? val : [];
        var allFilled = arr.length >= 3 && arr.every(function (x) { return x && String(x).trim(); });
        if (!allFilled) {
          fail(wrapEl, COMMON.errorMultiSlots || '3つとも入力してから進んでください');
        }
      }
    });

    return { ok: ok, firstEl: firstErrorEl };
  }

  // 各質問の描画
  function renderDayQuestions(card, t, dayN) {
    var dayKey = 'day' + dayN;
    var content = t[dayKey];
    if (!content || !content.questions) return;

    // 代替質問（"今日は料理をしなかった" 等）は最後にまとめて描画
    var altWrapRef = { el: null, altInputRef: null };

    content.questions.forEach(function (q) {
      var savedVal = (state.answers[dayKey] || {})[q.key];

      var qLabel = el('div', {
        className: 'day-question serif',
        text: q.label
      });
      // バリデーション時アンカー用
      qLabel.setAttribute('data-vkey', dayKey + '_' + q.key);
      qLabel.setAttribute('tabindex', '-1');
      card.appendChild(qLabel);

      if (q.type === 'single_choice' || q.type === 'single_choice_with_other') {
        var choicesWrap = el('div', { className: 'choices', 'data-qkey': q.key });
        q.options.forEach(function (opt) {
          var b = el('button', {
            type: 'button', className: 'choice' + (savedVal === opt ? ' selected' : ''),
            text: opt
          });
          b.addEventListener('click', function () {
            $$('.choice', choicesWrap).forEach(function (x) { x.classList.remove('selected'); });
            b.classList.add('selected');
            state.answers[dayKey][q.key] = opt;
            saveState();
            // "その他" 分岐
            if (q.type === 'single_choice_with_other' && opt === 'その他') {
              otherWrap.style.display = 'block';
            } else if (q.type === 'single_choice_with_other') {
              otherWrap.style.display = 'none';
              state.answers[dayKey][q.otherKey] = '';
            }
            // 特殊トリガー
            if (content.onSpecial && content.onSpecial.trigger === opt && specialMsg) {
              specialMsg.style.display = 'block';
            } else if (specialMsg) {
              specialMsg.style.display = 'none';
            }
            // "今日は料理をしなかった" などalt質問トリガー
            toggleAltVisibility(content, opt, altWrapRef);
          });
          choicesWrap.appendChild(b);
        });
        card.appendChild(choicesWrap);

        // "その他" 入力欄
        var otherWrap = null;
        if (q.type === 'single_choice_with_other') {
          otherWrap = el('div', { className: 'field', style: 'margin-top:6px;' });
          otherWrap.appendChild(el('label', { className: 'input-label', text: q.otherLabel || 'よければ教えてください' }));
          var otherInput = el('input', {
            type: 'text', className: 'input',
            value: (state.answers[dayKey] || {})[q.otherKey] || ''
          });
          otherInput.addEventListener('input', function () {
            state.answers[dayKey][q.otherKey] = otherInput.value;
            saveState();
          });
          otherWrap.appendChild(otherInput);
          otherWrap.style.display = savedVal === 'その他' ? 'block' : 'none';
          card.appendChild(otherWrap);
        }

        // 特殊メッセージ枠
        var specialMsg = null;
        if (content.onSpecial) {
          specialMsg = el('div', {
            className: 'day-complete-msg',
            text: content.onSpecial.message,
            style: 'display:' + (savedVal === content.onSpecial.trigger ? 'block' : 'none') + '; padding:14px 8px 4px;'
          });
          card.appendChild(specialMsg);
        }
      }

      else if (q.type === 'text_with_suggestions') {
        var textWrap = el('div', { className: 'field' });
        var input = el('input', {
          type: 'text', className: 'input',
          placeholder: q.placeholder || '',
          value: savedVal || ''
        });
        input.addEventListener('input', function () {
          state.answers[dayKey][q.key] = input.value;
          saveState();
          // 特殊トリガーとの一致確認
          if (content.onSpecial && input.value === content.onSpecial.trigger && specialMsg2) {
            specialMsg2.style.display = 'block';
          } else if (specialMsg2) {
            specialMsg2.style.display = 'none';
          }
          toggleAltVisibility(content, input.value, altWrapRef);
        });
        textWrap.appendChild(input);
        card.appendChild(textWrap);

        // 補助候補
        if (q.suggestions && q.suggestions.length) {
          var sugWrap = el('div', { className: 'suggestions' });
          q.suggestions.forEach(function (s) {
            var chip = el('button', { type: 'button', className: 'chip', text: s });
            chip.addEventListener('click', function () {
              input.value = s;
              state.answers[dayKey][q.key] = s;
              saveState();
              if (content.onSpecial && s === content.onSpecial.trigger && specialMsg2) {
                specialMsg2.style.display = 'block';
              } else if (specialMsg2) {
                specialMsg2.style.display = 'none';
              }
              toggleAltVisibility(content, s, altWrapRef);
            });
            sugWrap.appendChild(chip);
          });
          card.appendChild(sugWrap);
        }

        var specialMsg2 = null;
        if (content.onSpecial) {
          specialMsg2 = el('div', {
            className: 'day-complete-msg',
            text: content.onSpecial.message,
            style: 'display:' + (savedVal === content.onSpecial.trigger ? 'block' : 'none') + '; padding:14px 8px 4px;'
          });
          card.appendChild(specialMsg2);
        }
      }

      else if (q.type === 'text_optional') {
        var wrap = el('div', { className: 'field' });
        var textInput = el('input', {
          type: 'text', className: 'input',
          placeholder: q.placeholder || '',
          value: savedVal || ''
        });
        textInput.addEventListener('input', function () {
          state.answers[dayKey][q.key] = textInput.value;
          saveState();
        });
        wrap.appendChild(textInput);
        card.appendChild(wrap);
      }

      else if (q.type === 'three_slots_with_suggestions') {
        var stapleVals = Array.isArray(savedVal) ? savedVal.slice() : ['', '', ''];
        while (stapleVals.length < 3) stapleVals.push('');
        state.answers[dayKey][q.key] = stapleVals;

        var slotFields = el('div', { className: 'slot-fields' });
        var slotInputs = [];
        for (var i = 0; i < 3; i++) {
          var slotWrap = el('div', { className: 'field' });
          slotWrap.appendChild(el('span', { className: 'slot-label', text: q.slots[i] }));
          var sIn = el('input', {
            type: 'text', className: 'input',
            placeholder: q.placeholders[i] || '',
            value: stapleVals[i] || '',
            'data-slot': i
          });
          (function (idx, inputEl) {
            inputEl.addEventListener('input', function () {
              stapleVals[idx] = inputEl.value;
              state.answers[dayKey][q.key] = stapleVals;
              saveState();
            });
          })(i, sIn);
          slotWrap.appendChild(sIn);
          slotInputs.push(sIn);
          slotFields.appendChild(slotWrap);
        }
        card.appendChild(slotFields);

        if (q.suggestions && q.suggestions.length) {
          card.appendChild(el('div', {
            className: 'input-label', text: '（下からタップして入れることもできます）',
            style: 'margin-top:6px;'
          }));
          var sugWrap2 = el('div', { className: 'suggestions' });
          q.suggestions.forEach(function (s) {
            var chip = el('button', { type: 'button', className: 'chip', text: s });
            chip.addEventListener('click', function () {
              // 空の枠から埋める
              var emptyIdx = stapleVals.findIndex(function (v) { return !v || !v.trim(); });
              if (emptyIdx < 0) emptyIdx = 2; // 全部埋まってたら最後に上書き
              stapleVals[emptyIdx] = s;
              slotInputs[emptyIdx].value = s;
              state.answers[dayKey][q.key] = stapleVals;
              saveState();
            });
            sugWrap2.appendChild(chip);
          });
          card.appendChild(sugWrap2);
        }
      }
    });

    // ---------- 代替質問（「今日は料理をしなかった」等） ----------
    if (content.altQuestion) {
      var alt = content.altQuestion;
      var altWrap = el('div', { className: 'alt-question-wrap', style: 'margin-top: 22px; display:none;' });
      var altLabel = el('div', { className: 'day-question serif', text: alt.label });
      altLabel.setAttribute('data-vkey', dayKey + '_' + alt.key);
      altLabel.setAttribute('tabindex', '-1');
      altWrap.appendChild(altLabel);

      var altSavedVal = (state.answers[dayKey] || {})[alt.key] || '';
      var altField = el('div', { className: 'field' });
      var altInput = el('input', {
        type: 'text', className: 'input',
        placeholder: alt.placeholder || '',
        value: altSavedVal
      });
      altInput.addEventListener('input', function () {
        state.answers[dayKey][alt.key] = altInput.value;
        saveState();
      });
      altField.appendChild(altInput);
      altWrap.appendChild(altField);
      card.appendChild(altWrap);

      altWrapRef.el = altWrap;

      // 初期表示：現状の主質問の値が trigger かどうかで判定
      var initialTriggered = false;
      (content.questions || []).forEach(function (q) {
        var v = (state.answers[dayKey] || {})[q.key];
        if (v === alt.trigger) initialTriggered = true;
      });
      altWrap.style.display = initialTriggered ? 'block' : 'none';
    }
  }

  // 主質問の選択値が alt.trigger と一致したら代替質問を表示
  function toggleAltVisibility(content, currentVal, altWrapRef) {
    if (!content || !content.altQuestion || !altWrapRef || !altWrapRef.el) return;
    var show = (currentVal === content.altQuestion.trigger);
    altWrapRef.el.style.display = show ? 'block' : 'none';
  }

  function renderDay3Content(card, t) {
    var content = t.day3;
    // 上部説明
    if (content.body) {
      card.appendChild(el('div', {
        className: 'page-body text-center mb-md',
        text: content.body
      }));
    }

    // カード自動生成プレビュー
    var savedCard = el('div', { className: 'saved-card' });
    savedCard.appendChild(el('div', { className: 'saved-card-eyebrow', text: '— YOUR CARD —' }));
    savedCard.appendChild(el('div', { className: 'saved-card-title serif', text: content.cardName }));
    // 生成データ
    var lines = generateCardLines(t);
    if (lines.length) {
      var ul = el('ul', { className: 'saved-card-list' });
      lines.forEach(function (line) {
        ul.appendChild(el('li', { text: line }));
      });
      savedCard.appendChild(ul);
    }
    card.appendChild(savedCard);

    // 追加質問（Dのみ：誰と食べたいか）
    if (content.extraQuestion) {
      var eq = content.extraQuestion;
      var savedEq = (state.answers.day3 || {})[eq.key];
      card.appendChild(el('div', { className: 'day-question serif', text: eq.label, style: 'margin-top:24px;' }));
      var eqWrap = el('div', { className: 'choices' });
      var eqOtherWrap = null;
      eq.options.forEach(function (opt) {
        var b = el('button', {
          type: 'button', className: 'choice' + (savedEq === opt ? ' selected' : ''),
          text: opt
        });
        b.addEventListener('click', function () {
          $$('.choice', eqWrap).forEach(function (x) { x.classList.remove('selected'); });
          b.classList.add('selected');
          state.answers.day3[eq.key] = opt;
          saveState();
          if (eq.type === 'single_choice_with_other') {
            if (opt === 'その他') eqOtherWrap.style.display = 'block';
            else {
              eqOtherWrap.style.display = 'none';
              state.answers.day3[eq.otherKey] = '';
            }
          }
        });
        eqWrap.appendChild(b);
      });
      card.appendChild(eqWrap);
      if (eq.type === 'single_choice_with_other') {
        eqOtherWrap = el('div', { className: 'field', style: 'margin-top:6px;' });
        eqOtherWrap.appendChild(el('label', { className: 'input-label', text: eq.otherLabel || 'よければ' }));
        var eqOtherInput = el('input', {
          type: 'text', className: 'input',
          value: (state.answers.day3 || {})[eq.otherKey] || ''
        });
        eqOtherInput.addEventListener('input', function () {
          state.answers.day3[eq.otherKey] = eqOtherInput.value;
          saveState();
        });
        eqOtherWrap.appendChild(eqOtherInput);
        eqOtherWrap.style.display = savedEq === 'その他' ? 'block' : 'none';
        card.appendChild(eqOtherWrap);
      }
    }

    // 使いたい日（複数選択）
    if (content.whenOptions) {
      card.appendChild(el('div', {
        className: 'day-question serif',
        text: COMMON.cardWhenLabel,
        style: 'margin-top:24px;'
      }));
      var savedWhen = (state.answers.day3 || {}).when || [];
      if (!Array.isArray(savedWhen)) savedWhen = [];
      var whenWrap = el('div', { className: 'multi-choices' });
      content.whenOptions.forEach(function (opt) {
        var b = el('button', {
          type: 'button',
          className: 'multi-choice' + (savedWhen.indexOf(opt) >= 0 ? ' selected' : ''),
          text: opt
        });
        b.addEventListener('click', function () {
          var idx = savedWhen.indexOf(opt);
          if (idx >= 0) {
            savedWhen.splice(idx, 1);
            b.classList.remove('selected');
          } else {
            savedWhen.push(opt);
            b.classList.add('selected');
          }
          state.answers.day3.when = savedWhen;
          saveState();
        });
        whenWrap.appendChild(b);
      });
      card.appendChild(whenWrap);
    }

    // 自分へのひとこと（任意）
    card.appendChild(el('label', {
      className: 'input-label',
      text: COMMON.cardNoteLabel,
      style: 'margin-top:20px; display:block;'
    }));
    var savedNote = (state.answers.day3 || {}).note || '';
    var noteInput = el('input', {
      type: 'text', className: 'input',
      placeholder: content.notePlaceholder || '',
      value: savedNote
    });
    noteInput.addEventListener('input', function () {
      state.answers.day3.note = noteInput.value;
      saveState();
    });
    card.appendChild(noteInput);
  }

  function renderDay4Content(card, t) {
    // Q1（共通）
    var q1Saved = state.answers.day4.q1;
    var q1Label = el('div', { className: 'day-question serif', text: COMMON.day4Q1 });
    q1Label.setAttribute('data-vkey', 'day4_q1');
    q1Label.setAttribute('tabindex', '-1');
    card.appendChild(q1Label);
    var q1Wrap = el('div', { className: 'choices' });
    COMMON.day4Q1Options.forEach(function (opt) {
      var b = el('button', {
        type: 'button',
        className: 'choice' + (q1Saved === opt ? ' selected' : ''),
        text: opt
      });
      b.addEventListener('click', function () {
        $$('.choice', q1Wrap).forEach(function (x) { x.classList.remove('selected'); });
        b.classList.add('selected');
        state.answers.day4.q1 = opt;
        saveState();
      });
      q1Wrap.appendChild(b);
    });
    card.appendChild(q1Wrap);

    // Q2（タイプ別）
    var q2Saved = state.answers.day4.q2;
    var q2Label = el('div', { className: 'day-question serif', text: COMMON.day4Q2, style: 'margin-top:24px;' });
    q2Label.setAttribute('data-vkey', 'day4_q2');
    q2Label.setAttribute('tabindex', '-1');
    card.appendChild(q2Label);
    var q2Wrap = el('div', { className: 'choices' });
    (t.day4.q2Options || []).forEach(function (opt) {
      var b = el('button', {
        type: 'button',
        className: 'choice' + (q2Saved === opt ? ' selected' : ''),
        text: opt
      });
      b.addEventListener('click', function () {
        $$('.choice', q2Wrap).forEach(function (x) { x.classList.remove('selected'); });
        b.classList.add('selected');
        state.answers.day4.q2 = opt;
        saveState();
      });
      q2Wrap.appendChild(b);
    });
    card.appendChild(q2Wrap);

    // Q3（タイプ別）
    var q3Saved = state.answers.day4.q3;
    var q3Label = el('div', { className: 'day-question serif', text: COMMON.day4Q3, style: 'margin-top:24px;' });
    q3Label.setAttribute('data-vkey', 'day4_q3');
    q3Label.setAttribute('tabindex', '-1');
    card.appendChild(q3Label);
    var q3Wrap = el('div', { className: 'choices' });
    (t.day4.q3Options || []).forEach(function (opt) {
      var b = el('button', {
        type: 'button',
        className: 'choice' + (q3Saved === opt ? ' selected' : ''),
        text: opt
      });
      b.addEventListener('click', function () {
        $$('.choice', q3Wrap).forEach(function (x) { x.classList.remove('selected'); });
        b.classList.add('selected');
        state.answers.day4.q3 = opt;
        saveState();
      });
      q3Wrap.appendChild(b);
    });
    card.appendChild(q3Wrap);

    // 任意入力（300字）
    var freeSaved = state.answers.day4.free || '';
    card.appendChild(el('label', {
      className: 'input-label',
      text: COMMON.day4FreeLabel,
      style: 'margin-top:24px; display:block;'
    }));
    var ta = el('textarea', {
      className: 'textarea',
      maxlength: String(COMMON.day4FreeMax || 300),
      placeholder: COMMON.day4FreePlaceholder || ''
    });
    ta.value = freeSaved;
    var counter = el('div', { className: 'char-count', text: freeSaved.length + ' / ' + (COMMON.day4FreeMax || 300) });
    ta.addEventListener('input', function () {
      state.answers.day4.free = ta.value;
      counter.textContent = ta.value.length + ' / ' + (COMMON.day4FreeMax || 300);
      saveState();
    });
    card.appendChild(ta);
    card.appendChild(counter);
  }

  function autoSaveDayInputs(dayN, t) {
    // 現状は入力イベントで即save済みだが、念のためsaveStateだけ呼ぶ
    saveState();
  }

  // ============================================================
  // カード画面（生成後の閲覧）
  // ============================================================
  function renderCard(root) {
    var t = TYPES[state.assignedType];
    if (!t || !state.cardCreated) { goto('home'); return; }

    var screen = el('section', { className: 'screen active' });
    var back = el('button', {
      type: 'button', className: 'back-link',
      onclick: function () { goto('home'); },
      text: 'ホームへ戻る'
    });
    screen.appendChild(back);

    var savedCard = el('div', { className: 'saved-card' });
    savedCard.appendChild(el('div', { className: 'saved-card-eyebrow', text: '— YOUR CARD —' }));
    savedCard.appendChild(el('div', { className: 'saved-card-title serif', text: t.day3.cardName }));
    var lines = generateCardLines(t);
    if (lines.length) {
      var ul = el('ul', { className: 'saved-card-list' });
      lines.forEach(function (line) { ul.appendChild(el('li', { text: line })); });
      savedCard.appendChild(ul);
    }
    var note = (state.answers.day3 || {}).note;
    if (note) {
      savedCard.appendChild(el('div', { className: 'saved-card-note', text: '「' + note + '」' }));
    }
    var when = (state.answers.day3 || {}).when || [];
    if (when.length) {
      savedCard.appendChild(el('div', {
        className: 'saved-card-when',
        text: '使いたい場面： ' + when.join(' / ')
      }));
    }
    screen.appendChild(savedCard);

    root.appendChild(screen);
  }

  function generateCardLines(t) {
    var lines = [];
    var struct = (t.day3 && t.day3.cardStructure) || [];
    var labels = (t.day3 && t.day3.cardLabels) || {};
    struct.forEach(function (key) {
      // "day2.staples" / "day1.q1" 等
      var parts = key.split('.');
      var dayKey = parts[0];
      var field = parts[1];
      var val = (state.answers[dayKey] || {})[field];
      var prefix = labels[key] || '';
      if (Array.isArray(val)) {
        val.forEach(function (v) {
          if (v && v.trim()) lines.push(prefix ? (prefix + v) : v);
        });
      } else if (val && String(val).trim()) {
        lines.push(prefix ? (prefix + String(val)) : String(val));
      }
    });
    return lines;
  }

  // ============================================================
  // 台所レポート
  // ============================================================
  function renderReport(root) {
    var t = TYPES[state.assignedType];
    if (!t || !state.completedDays.day4) { goto('home'); return; }

    // 初回閲覧を記録（進捗5/5達成のトリガー）
    if (!state.reportViewed) {
      state.reportViewed = true;
      saveState();
      trackEvent('report_viewed', {});
    }

    var screen = el('section', { className: 'screen active' });

    var back = el('button', {
      type: 'button', className: 'back-link',
      onclick: function () { goto('home'); },
      text: 'ホームへ戻る'
    });
    screen.appendChild(back);

    screen.appendChild(el('div', { className: 'eyebrow', text: '— REPORT —' }));
    screen.appendChild(el('h1', { className: 'page-title', text: COMMON.reportHeading }));

    var card = el('div', { className: 'card card-lg' });

    // 現在地
    addReportSection(card, COMMON.reportCurrentLabel, t.report.currentText);

    // 1日目
    var day1Text = fillTemplate(t.report.day1Template, state.answers.day1, t);
    if (day1Text) addReportSection(card, COMMON.reportDay1Label, day1Text);

    // 2日目
    var day2Text = fillTemplate(t.report.day2Template, state.answers.day2, t);
    if (day2Text) addReportSection(card, COMMON.reportDay2Label, day2Text);

    // 3日目
    var day3Text = fillTemplate(t.report.day3Template, state.answers.day3, t);
    if (day3Text) addReportSection(card, COMMON.reportDay3Label, day3Text);

    // 4日目：本人が感じた変化（Q1）
    var q1 = state.answers.day4.q1 || '';
    var day4Text = day4Q1ToNaturalText(q1);
    if (state.answers.day4.free && String(state.answers.day4.free).trim()) {
      day4Text += '\n\n' + state.answers.day4.free;
    }
    addReportSection(card, COMMON.reportDay4Label, day4Text);

    // 4日目：この先に感じている変化（Q2）
    var q2 = state.answers.day4.q2 || '';
    if (q2) {
      var q2Text = day4Q2ToNaturalText(q2);
      addReportSection(card, COMMON.reportChangeExpectedLabel || 'この先に感じている変化', q2Text);
    }

    // 次の目標（Q3）
    if (state.answers.day4.q3) {
      addReportSection(card, COMMON.reportNextLabel, state.answers.day4.q3);
    }

    // まとめ
    var summary = el('div', { className: 'report-summary' });
    summary.appendChild(el('div', { className: 'report-summary-label', text: COMMON.reportSummaryLabel }));
    summary.appendChild(el('div', { className: 'report-summary-body', text: t.report.summary }));
    card.appendChild(summary);

    screen.appendChild(card);

    // オファーへ
    var btnRow = el('div', { className: 'text-center mt-lg' });
    var goOfferBtn = el('button', {
      className: 'btn btn-primary btn-block',
      type: 'button',
      onclick: function () { goto('offer'); },
      text: 'この続きの案内を読む →'
    });
    btnRow.appendChild(goOfferBtn);
    screen.appendChild(btnRow);

    root.appendChild(screen);
  }

  // Q1（"かなり感じた"/"少し感じた"/"まだ分からない"）を自然文に
  function day4Q1ToNaturalText(q1) {
    switch (q1) {
      case 'かなり感じた':
        return '以前より、気持ちや見方の変化を\nしっかり感じています。';
      case '少し感じた':
        return '以前より、気持ちや見方が\n少し変わったと感じています。';
      case 'まだ分からない':
        return 'まだ大きな変化は分からないかもしれません。\nただ、小さく試すための土台はできました。';
      default:
        return q1
          ? 'あなたは、この4日間で\n「' + q1 + '」と答えました。'
          : '';
    }
  }

  // Q2（続けたらどんな変化がありそうか）を自然文に
  function day4Q2ToNaturalText(q2) {
    if (!q2) return '';
    if (q2 === 'まだ想像できない') {
      return 'この先の変化は、まだはっきりとは想像できないかもしれません。\nただ、続けた分だけ、静かに変わっていくはずです。';
    }
    return 'あなたは、この小さな実践を続けることで、\n「' + q2 + '」と感じています。';
  }

  function addReportSection(root, label, body) {
    var sec = el('div', { className: 'report-section' });
    sec.appendChild(el('div', { className: 'report-section-label', text: label }));
    sec.appendChild(el('div', { className: 'report-section-body', text: body }));
    root.appendChild(sec);
  }

  // テンプレート内 {day_key} / {day_key_line} をデータで置換
  //   {day2_q1}       → 値そのまま
  //   {day2_q1_line}  → 値がある時のみ 改行＋ラベル付き で挿入（Cレポート用）
  function fillTemplate(tpl, data, t) {
    if (!tpl) return '';
    // ラベル定義（"_line" 表示時の見出し）
    var LINE_LABELS = {
      'day2_dish_name_line': '\n\n料理：\n',
      'day2_q2_line': '\n\n次回へのメモ：\n'
    };
    return tpl.replace(/\{([^}]+)\}/g, function (m, key) {
      // "_line" 版
      if (/_line$/.test(key)) {
        var baseKey = key.replace(/_line$/, '');
        var parts = baseKey.split('_');
        var dayK = parts[0];
        var fieldK = parts.slice(1).join('_');
        var val = (state.answers[dayK] || {})[fieldK];
        if (val == null || String(val).trim() === '') return '';
        var lineLabel = LINE_LABELS[key] || '\n';
        return lineLabel + String(val);
      }
      // 通常
      var parts2 = key.split('_');
      var dayK2 = parts2[0];
      var fieldK2 = parts2.slice(1).join('_');
      var val2 = (state.answers[dayK2] || {})[fieldK2];
      if (Array.isArray(val2)) {
        return val2.filter(function (v) { return v && v.trim(); }).join('・');
      }
      return val2 ? String(val2) : '';
    });
  }

  // ============================================================
  // オファー画面
  // ============================================================
  function renderOffer(root) {
    // ---------- アクセス制御（仕様2） ----------
    if (
      !state.completedDays.day4 ||
      !state.reportGenerated ||
      VALID_TYPES.indexOf(state.assignedType) === -1
    ) {
      // 条件不足 → offerViewed も更新せずホームへ
      goto('home');
      return;
    }

    var t = TYPES[state.assignedType];
    if (!t) { goto('home'); return; }

    // 条件通過後にのみ offerViewed 記録
    if (!state.offerViewed) {
      state.offerViewed = true;
      saveState();
      trackEvent('offer_viewed', {});
    }

    var screen = el('section', { className: 'screen active' });

    var back = el('button', {
      type: 'button', className: 'back-link',
      onclick: function () { goto('report'); },
      text: 'レポートへ戻る'
    });
    screen.appendChild(back);

    screen.appendChild(el('div', { className: 'eyebrow', text: '— NEXT STEP —' }));
    screen.appendChild(el('h1', { className: 'offer-heading', text: COMMON.offerHeading }));

    // タイプ別接続文
    if (t.offerBridge) {
      screen.appendChild(el('div', {
        className: 'page-body text-center mb-lg',
        text: t.offerBridge
      }));
    }

    // ---------- オファー動画（offerVideoUrl 設定時のみ） ----------
    if (CFG.offerVideoUrl && String(CFG.offerVideoUrl).trim()) {
      var offerVideoTitle = el('div', {
        className: 'eyebrow mb-sm',
        text: COMMON.offerVideoTitle || '4日間を終えたあなたへ'
      });
      offerVideoTitle.style.marginTop = '4px';
      screen.appendChild(offerVideoTitle);

      var offerVideoWrap = el('div', { className: 'video-wrap' });
      var offerIsYouTube = /youtube\.com|youtu\.be/.test(CFG.offerVideoUrl);
      if (offerIsYouTube) {
        var oIframe = el('iframe', {
          src: CFG.offerVideoUrl,
          allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
          allowfullscreen: 'allowfullscreen'
        });
        offerVideoWrap.appendChild(oIframe);
      } else {
        var oVid = el('video', { controls: 'controls', playsinline: 'playsinline' });
        var oSrc = el('source', { src: CFG.offerVideoUrl, type: 'video/mp4' });
        oVid.appendChild(oSrc);
        offerVideoWrap.appendChild(oVid);
      }
      screen.appendChild(offerVideoWrap);
    }

    // ---------- メインオファー（あなたにいちばん合うサービス） ----------
    var mainName = t.mainOffer;
    var mainSvc = (COMMON.services || {})[mainName];
    if (mainSvc) {
      var card = el('div', { className: 'card card-lg card-primary' });
      card.appendChild(el('div', {
        className: 'eyebrow',
        text: COMMON.offerMainBadge || 'あなたにいちばんおすすめ',
        style: 'margin-bottom:8px;'
      }));
      card.appendChild(el('div', {
        className: 'page-title serif',
        text: mainSvc.name,
        style: 'font-size:20px; margin-bottom:8px;'
      }));
      if (mainSvc.tagline) {
        card.appendChild(el('div', {
          className: 'page-body text-center',
          text: mainSvc.tagline,
          style: 'font-size:13.5px; color:var(--muted); margin-bottom:14px; white-space:pre-line;'
        }));
      }
      card.appendChild(el('div', { className: 'offer-body', text: mainSvc.body }));

      var features = el('ul', { className: 'offer-features' });
      (mainSvc.features || []).forEach(function (f) {
        features.appendChild(el('li', { text: f }));
      });
      card.appendChild(features);

      if (mainSvc.priceMain) {
        var price = el('div', { className: 'offer-price' });
        price.appendChild(el('div', { className: 'offer-price-main', text: mainSvc.priceMain }));
        if (mainSvc.priceSub) {
          price.appendChild(el('div', { className: 'offer-price-sub', text: mainSvc.priceSub }));
        }
        card.appendChild(price);
      }

      var mainUrl = resolveServiceUrl_(mainSvc);
      var btn = el('a', {
        className: 'btn btn-primary btn-block',
        href: mainUrl,
        target: '_blank',
        rel: 'noopener',
        text: mainSvc.name + 'を詳しく見る'
      });
      btn.addEventListener('click', function () {
        if (!state.offerClicked) {
          state.offerClicked = true;
          saveState();
        }
        trackEvent('offer_clicked', { service: mainSvc.name, position: 'main' });
      });
      card.appendChild(btn);

      screen.appendChild(card);
    }

    // ---------- サブオファー（他にもこんなサポートあります） ----------
    var subNames = (t.subOffers || []);
    if (subNames.length) {
      screen.appendChild(el('div', {
        className: 'eyebrow mt-lg mb-sm',
        text: COMMON.offerSubLabel || '他にも、こんなサポートがあります',
        style: 'margin-top:22px;'
      }));

      subNames.forEach(function (name) {
        var svc = (COMMON.services || {})[name];
        if (!svc) return;
        var subCard = el('div', { className: 'card' });
        subCard.appendChild(el('div', {
          className: 'page-title serif',
          text: svc.name,
          style: 'font-size:16px; margin-bottom:6px; text-align:left;'
        }));
        if (svc.tagline) {
          subCard.appendChild(el('div', {
            className: 'day-item-sub',
            text: svc.tagline,
            style: 'margin-bottom:12px; white-space:pre-line;'
          }));
        }
        if (svc.priceMain) {
          subCard.appendChild(el('div', {
            className: 'offer-price-sub',
            text: svc.priceMain,
            style: 'text-align:left; margin-bottom:10px;'
          }));
        }
        var subUrl = resolveServiceUrl_(svc);
        var subBtn = el('a', {
          className: 'btn btn-secondary btn-block',
          href: subUrl,
          target: '_blank',
          rel: 'noopener',
          text: (COMMON.offerBtnPrefix || '詳しく見る →')
        });
        subBtn.addEventListener('click', function () {
          trackEvent('offer_clicked', { service: svc.name, position: 'sub' });
        });
        subCard.appendChild(subBtn);
        screen.appendChild(subCard);
      });
    }

    root.appendChild(screen);
  }

  // サービスの申込URLを、config.js の courseUrls から引く
  function resolveServiceUrl_(svc) {
    if (!svc) return '#';
    var urls = CFG.courseUrls || {};
    if (svc.urlKey && urls[svc.urlKey]) return urls[svc.urlKey];
    // フォールバック（旧設定と互換）
    return CFG.courseUrl || '#';
  }

  // ============================================================
  // 期限後
  // ============================================================
  function renderExpired(root, hasSaved) {
    trackEvent('app_expired', {});
    var screen = el('section', { className: 'screen active' });

    screen.appendChild(el('div', { className: 'eyebrow', text: '— END OF 4 DAYS —' }));
    screen.appendChild(el('h1', { className: 'page-title', text: COMMON.expiredHeading }));
    screen.appendChild(el('div', {
      className: 'page-body text-center mb-lg',
      text: COMMON.expiredBody
    }));

    // 引き続き見られるもの（4日間完了時のみコース案内へ進めるボタンを表示）
    var list = el('div', { className: 'card' });
    if (state.cardCreated) {
      var b1 = el('button', {
        className: 'btn btn-secondary btn-block mb-md',
        type: 'button',
        text: COMMON.cardLinkLabel,
        onclick: function () { goto('card'); }
      });
      list.appendChild(b1);
    }
    if (state.reportGenerated) {
      var b2 = el('button', {
        className: 'btn btn-secondary btn-block mb-md',
        type: 'button',
        text: COMMON.reportLinkLabel,
        onclick: function () { goto('report'); }
      });
      list.appendChild(b2);
    }
    // 期限切れ画面から直接コース外部URLは出さない。
    // 4日間＋レポート閲覧が済んでいるユーザーには「案内へ進む」でオファーへ遷移させ、
    // 未達なら案内自体を出さない（仕様1・仕様2）。
    if (
      state.completedDays.day4 &&
      state.reportGenerated
    ) {
      var b3 = el('button', {
        className: 'btn btn-primary btn-block',
        type: 'button',
        text: 'この続きの案内を読む →',
        onclick: function () { goto('offer'); }
      });
      list.appendChild(b3);
    }
    screen.appendChild(list);

    root.appendChild(screen);
  }

  // ============================================================
  // 別タイプURL開いた場合
  // ============================================================
  function renderAlreadyStarted(root) {
    var screen = el('section', { className: 'screen active' });
    screen.appendChild(el('div', { className: 'eyebrow', text: '— ALREADY STARTED —' }));
    screen.appendChild(el('h1', { className: 'page-title', text: COMMON.alreadyStartedHeading }));
    screen.appendChild(el('div', {
      className: 'page-body text-center mb-lg',
      text: COMMON.alreadyStartedBody
    }));
    var btn = el('button', {
      className: 'btn btn-primary btn-block',
      type: 'button',
      onclick: function () {
        goto(state.startedAt ? 'home' : 'welcome');
      },
      text: '続きを開く'
    });
    screen.appendChild(btn);
    root.appendChild(screen);
  }

  // ============================================================
  // 不正 type
  // ============================================================
  function renderInvalidType(root) {
    var screen = el('section', { className: 'screen active' });
    screen.appendChild(el('div', { className: 'eyebrow', text: '— NO ENTRY —' }));
    screen.appendChild(el('h1', { className: 'page-title', text: COMMON.invalidTypeHeading }));
    screen.appendChild(el('div', {
      className: 'page-body text-center',
      text: COMMON.invalidTypeBody
    }));
    root.appendChild(screen);
  }

  // ============================================================
  // ローディング
  // ============================================================
  function showLoading(text, minMs) {
    var splash = $('#loading-splash');
    if (!splash) return;
    var txt = $('.loading-text', splash);
    if (txt) txt.textContent = text || 'しばらくお待ちください';
    splash.classList.add('active');
  }
  function hideLoading() {
    var splash = $('#loading-splash');
    if (splash) splash.classList.remove('active');
  }

  // ============================================================
  // ストレージ利用不可
  // ============================================================
  function renderStorageError() {
    var app = $('#app');
    if (!app) return;
    app.innerHTML = '';
    var box = el('div', { className: 'storage-fallback' });
    box.innerHTML =
      'このアプリを利用するには、<br>' +
      'ブラウザの保存領域（localStorage）が必要です。<br><br>' +
      'プライベートモードや、拡張機能で無効にされていないか<br>' +
      'ご確認いただき、再度お試しください。';
    app.appendChild(box);
  }

  // ============================================================
  // Debug バー
  // ============================================================
  function renderDebugBar() {
    var bar = $('#debug-bar');
    if (!bar) return;
    bar.innerHTML = '';
    bar.classList.add('active');

    // --- 現在の状態表示 ---
    var typeTag = state.assignedType || '未設定';
    var mode = CFG.testMode ? 'test' : 'normal';
    var startedInfo = state.startedAt ? (Math.round((Date.now() - new Date(state.startedAt).getTime()) / 3600000 * 10) / 10) + 'h経過' : '未開始';
    bar.appendChild(el('span', {
      className: 'debug-tag',
      text: 'DEBUG ・ type=' + typeTag + ' ・ ' + mode + ' ・ ' + startedInfo
    }));

    // --- グループ1：タイプ切替（入口設定） ---
    var g1Label = el('span', { className: 'debug-tag', text: '入口:' });
    bar.appendChild(g1Label);
    ['A', 'B', 'C', 'D'].forEach(function (T) {
      var isCurrent = state.assignedType === T;
      var b = el('button', {
        type: 'button',
        text: T + (isCurrent ? '●' : ''),
        title: T + 'タイプで初期化してスタート'
      });
      b.addEventListener('click', function () {
        if (!confirm('タイプ ' + T + ' で新しく開始しますか？（現在のデータは消えます）')) return;
        resetState();
        state.assignedType = T;
        state.startedAt = nowIso();
        saveState();
        location.href = location.pathname + '?type=' + T + '&debug=1';
      });
      bar.appendChild(b);
    });

    // --- グループ2：画面ジャンプ ---
    var g2Label = el('span', { className: 'debug-tag', text: '画面:' });
    bar.appendChild(g2Label);

    var screens = [
      { key: 'name-input', label: 'name入力', ensure: function () {
          if (state.assignedType) pendingType = state.assignedType;
          state.startedAt = '';
          state.assignedType = null;
          state.name = '';
          saveState();
      } },
      { key: 'welcome', label: 'welcome', ensure: function () {
          if (state.assignedType) pendingType = state.assignedType;
          state.startedAt = '';
          state.assignedType = null;
          saveState();
      } },
      { key: 'check-line', label: 'checkLINE', ensure: ensureStarted },
      { key: 'home',    label: 'home',    ensure: ensureStarted },
      { key: 'day1',    label: 'day1',    ensure: ensureStartedAndUnlock(1) },
      { key: 'day2',    label: 'day2',    ensure: ensureStartedAndUnlock(2) },
      { key: 'day3',    label: 'day3',    ensure: ensureStartedAndUnlock(3) },
      { key: 'day4',    label: 'day4',    ensure: ensureStartedAndUnlock(4) },
      { key: 'card',    label: 'card',    ensure: function () {
          ensureStarted();
          state.completedDays.day3 = true;
          state.cardCreated = true;
          saveState();
      }},
      { key: 'report',  label: 'report',  ensure: function () {
          ensureStarted();
          state.completedDays.day1 = true;
          state.completedDays.day2 = true;
          state.completedDays.day3 = true;
          state.completedDays.day4 = true;
          state.cardCreated = true;
          state.reportGenerated = true;
          saveState();
      }},
      { key: 'offer',   label: 'offer',   ensure: function () {
          ensureStarted();
          state.completedDays.day1 = true;
          state.completedDays.day2 = true;
          state.completedDays.day3 = true;
          state.completedDays.day4 = true;
          state.cardCreated = true;
          state.reportGenerated = true;
          saveState();
      }},
      { key: 'expired', label: 'expired', ensure: function () {
          if (!state.startedAt) state.startedAt = nowIso();
          // 開始時刻をアプリ期限より過去にセット
          var expireMs = appAvailableMs();
          state.startedAt = new Date(Date.now() - expireMs - 1000).toISOString();
          saveState();
      }}
    ];
    screens.forEach(function (s) {
      var b = el('button', {
        type: 'button', text: '▶' + s.label,
        title: s.label + '画面へジャンプ'
      });
      b.addEventListener('click', function () {
        if (!state.assignedType) {
          alert('先に「入口」でタイプを選んでください');
          return;
        }
        s.ensure();
        goto(s.key, { force: true });
      });
      bar.appendChild(b);
    });

    // --- グループ3：時間操作 ---
    var g3Label = el('span', { className: 'debug-tag', text: '時間:' });
    bar.appendChild(g3Label);

    bar.appendChild(el('button', {
      type: 'button', text: '⏭ 次の日解放',
      title: '開始時刻を24時間巻き戻して、次の日が開けるようにする',
      onclick: function () {
        if (!state.startedAt) {
          alert('先に「入口」または「▶welcome」から開始してください');
          return;
        }
        // 開始時刻を "解放間隔" 分だけ過去に
        var interval = unlockIntervalMs();
        var currentStart = new Date(state.startedAt).getTime();
        state.startedAt = new Date(currentStart - interval).toISOString();
        saveState();
        goto('home', { force: true });
      }
    }));

    bar.appendChild(el('button', {
      type: 'button', text: '⏰ 期限切れ',
      title: 'アプリ有効期限を過ぎた状態にする',
      onclick: function () {
        if (!state.startedAt) state.startedAt = nowIso();
        state.startedAt = new Date(Date.now() - appAvailableMs() - 1000).toISOString();
        saveState();
        goto('home', { force: true });
      }
    }));

    bar.appendChild(el('button', {
      type: 'button', text: '⏰ 今開始',
      title: '開始時刻を "今" に戻す（1日目のみ解放状態）',
      onclick: function () {
        state.startedAt = nowIso();
        saveState();
        goto('home', { force: true });
      }
    }));

    // --- グループ4：完了ショートカット ---
    var g4Label = el('span', { className: 'debug-tag', text: '完了:' });
    bar.appendChild(g4Label);

    [1, 2, 3, 4].forEach(function (n) {
      bar.appendChild(el('button', {
        type: 'button', text: '✓day' + n,
        title: n + '日目を完了扱いにする',
        onclick: function () {
          if (!state.startedAt) state.startedAt = nowIso();
          state.completedDays['day' + n] = true;
          if (n === 3) state.cardCreated = true;
          if (n === 4) state.reportGenerated = true;
          saveState();
          goto('home', { force: true });
        }
      }));
    });

    // --- グループ5：全リセット ---
    bar.appendChild(el('button', {
      type: 'button', text: '🗑 reset',
      title: '保存データを全て削除してリロード',
      onclick: function () {
        if (!confirm('全データをリセットしますか？')) return;
        resetState();
        location.reload();
      }
    }));
  }

  // --- Debug helpers ---
  function ensureStarted() {
    // assignedTypeが空なら pendingType または現URLの type を採用
    if (!state.assignedType) {
      var ct = currentType() || getQueryParam('type');
      if (ct && VALID_TYPES.indexOf(ct) >= 0) {
        state.assignedType = ct;
      }
    }
    if (!state.startedAt) {
      state.startedAt = nowIso();
    }
    saveState();
  }
  function ensureStartedAndUnlock(dayN) {
    return function () {
      ensureStarted();
      // その日が解放されるように、開始時刻を過去に巻き戻す
      var interval = unlockIntervalMs();
      var needed = (dayN - 1) * interval;
      var start = new Date(state.startedAt).getTime();
      var age = Date.now() - start;
      if (age < needed) {
        state.startedAt = new Date(Date.now() - needed - 1000).toISOString();
        saveState();
      }
    };
  }

  // ============================================================
  // グローバルエラーで白画面にしない
  // ============================================================
  window.addEventListener('error', function (e) {
    console.error('Global error caught:', e.error || e.message);
    var app = $('#app');
    if (app && !app.hasChildNodes()) {
      app.innerHTML = '<div class="storage-fallback">読み込みで問題が起きました。<br>ページを再読み込みしてお試しください。</div>';
    }
  });

  // ============================================================
  // 起動
  // ============================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

})();
