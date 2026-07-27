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
      startedAt: '',
      lastVisitedAt: '',
      completedDays: { day1: false, day2: false, day3: false, day4: false },
      answers: { day1: {}, day2: {}, day3: {}, day4: {} },
      cardCreated: false,
      reportGenerated: false,
      offerViewed: false,
      offerClicked: false
    };
  }

  var state = defaultState();

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
  }

  // ------------------------------------------------------------
  // タイプ判定
  // ------------------------------------------------------------
  function resolveType() {
    var urlType = getQueryParam('type');
    var savedType = state.assignedType;

    if (savedType && VALID_TYPES.indexOf(savedType) >= 0) {
      // 保存済みが優先。別タイプURLの場合は "既に開始済み" 表示
      if (urlType && VALID_TYPES.indexOf(urlType) >= 0 && urlType !== savedType) {
        return { type: savedType, mismatch: true };
      }
      return { type: savedType, mismatch: false };
    }

    if (urlType && VALID_TYPES.indexOf(urlType) >= 0) {
      return { type: urlType, fromUrl: true, mismatch: false };
    }

    return { type: null };
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

  function isDayUnlocked(dayN) {
    if (dayN === 1) return !!state.startedAt;
    var unlockAt = getDayUnlockAt(dayN);
    if (!unlockAt) return false;
    return Date.now() >= unlockAt.getTime();
  }

  function hoursUntilUnlock(dayN) {
    var unlockAt = getDayUnlockAt(dayN);
    if (!unlockAt) return null;
    var ms = unlockAt.getTime() - Date.now();
    if (ms <= 0) return 0;
    return Math.ceil(ms / 3600000);
  }

  function completedCount() {
    var c = 1; // 診断完了ぶん
    ['day1','day2','day3','day4'].forEach(function (k) {
      if (state.completedDays[k]) c++;
    });
    return c;
  }

  // ------------------------------------------------------------
  // イベント
  // ------------------------------------------------------------
  function trackEvent(name, payload) {
    payload = payload || {};
    if (!payload.type) payload.type = state.assignedType;
    console.log('[event]', name, payload);
    // 本番でLINEやスプシに送るときは、ここでfetch等を追加
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
    var t = resolveType();
    if (t.type) {
      state.assignedType = t.type;
      saveState();
    }

    if (!t.type) {
      goto('invalid-type', { scrollTop: false });
      return;
    }
    if (t.mismatch) {
      goto('already-started', { scrollTop: false });
      return;
    }
    if (!state.startedAt) {
      goto('welcome', { scrollTop: false });
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
      case 'welcome': renderWelcome(app); break;
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
  // ウェルカム画面
  // ============================================================
  function renderWelcome(root) {
    var t = TYPES[state.assignedType];
    if (!t) return renderInvalidType(root);

    trackEvent('app_viewed', {});

    var screen = el('section', { className: 'screen active' });
    screen.appendChild(el('div', { className: 'eyebrow', text: '— START —' }));
    screen.appendChild(el('h1', { className: 'page-title', text: COMMON.welcomeHeading }));

    // タイプ別イントロ
    var intro = el('div', {
      className: 'page-body text-center mb-md',
      text: t.intro
    });
    screen.appendChild(intro);

    // 動画
    if (CFG.welcomeVideoUrl && CFG.welcomeVideoUrl.trim()) {
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
      var videoTitle = el('div', {
        className: 'eyebrow mb-sm',
        text: COMMON.welcomeVideoTitle
      });
      videoTitle.style.marginTop = '18px';
      screen.appendChild(videoTitle);
      screen.appendChild(videoWrap);
    }

    // 本文
    var body = el('div', { className: 'card' });
    body.appendChild(el('div', {
      className: 'page-body',
      text: COMMON.welcomeBody
    }));
    screen.appendChild(body);

    // 開始ボタン
    var btnRow = el('div', { className: 'text-center mt-lg' });
    var btn = el('button', {
      className: 'btn btn-primary btn-block',
      type: 'button',
      onclick: startApp,
      text: COMMON.startBtn
    });
    btnRow.appendChild(btn);
    screen.appendChild(btnRow);

    root.appendChild(screen);
  }

  function startApp() {
    if (state.startedAt) return; // 二重防止
    state.startedAt = nowIso();
    saveState();
    trackEvent('app_started', {});
    goto('home');
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
        var h = hoursUntilUnlock(i);
        if (h == null) {
          subText = COMMON.lockedDayLabel || 'まだ開いていません';
        } else if (h <= 12) {
          subText = (COMMON.unlockedHoursTemplate || 'あと約{h}時間で開きます').replace('{h}', h);
        } else {
          subText = COMMON.unlockedTomorrow || '明日、開きます';
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
      badge: reportUnlocked ? (state.reportGenerated ? 'ひらく →' : '見に行く →') : '',
      state: reportUnlocked ? (state.reportGenerated ? 'completed' : '') : 'locked',
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

    // Course sub-link
    var subLink = el('div', { className: 'home-sub-link' });
    var a = el('a', {
      href: CFG.courseUrl || '#',
      target: '_blank',
      rel: 'noopener',
      text: COMMON.courseSubLinkLabel || 'すでに家庭料理マスターコースを詳しく知りたい方へ'
    });
    subLink.appendChild(a);
    screen.appendChild(subLink);

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
    if (!isDayUnlocked(dayN)) { goto('home'); return; }

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

      // バリデーション
      if (dayN === 2 && state.assignedType === 'B') {
        var s = state.answers.day2.staples || [];
        var allFilled = s.length >= 3 && s.every(function (x) { return x && x.trim(); });
        if (!allFilled) {
          completeBtn.dataset.busy = '';
          alert('3つとも入力してから進めてください。');
          return;
        }
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

  // 各質問の描画
  function renderDayQuestions(card, t, dayN) {
    var dayKey = 'day' + dayN;
    var content = t[dayKey];
    if (!content || !content.questions) return;

    content.questions.forEach(function (q) {
      var savedVal = (state.answers[dayKey] || {})[q.key];

      card.appendChild(el('div', {
        className: 'day-question serif',
        text: q.label
      }));

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
              // トリガー分岐用
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
    card.appendChild(el('div', { className: 'day-question serif', text: COMMON.day4Q1 }));
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
    card.appendChild(el('div', { className: 'day-question serif', text: COMMON.day4Q2, style: 'margin-top:24px;' }));
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
    card.appendChild(el('div', { className: 'day-question serif', text: COMMON.day4Q3, style: 'margin-top:24px;' }));
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
    struct.forEach(function (key) {
      // "day2.staples" / "day1.q1" 等
      var parts = key.split('.');
      var dayKey = parts[0];
      var field = parts[1];
      var val = (state.answers[dayKey] || {})[field];
      if (Array.isArray(val)) {
        val.forEach(function (v) { if (v && v.trim()) lines.push(v); });
      } else if (val && String(val).trim()) {
        lines.push(String(val));
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

    // 4日目：本人が感じた変化
    var q1 = state.answers.day4.q1 || '';
    var day4Text;
    if (q1 === 'まだ分からない') {
      day4Text = 'まだ大きな変化は感じていないかもしれません。\nただ、この4日間の小さな実践が、\n次の一歩の土台になっています。';
    } else {
      day4Text = 'あなたは、この4日間で\n「' + q1 + '」変化を感じられたと答えました。\n' +
        (state.answers.day4.free ? '\n' + state.answers.day4.free : '');
    }
    addReportSection(card, COMMON.reportDay4Label, day4Text);

    // 次の目標
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

  function addReportSection(root, label, body) {
    var sec = el('div', { className: 'report-section' });
    sec.appendChild(el('div', { className: 'report-section-label', text: label }));
    sec.appendChild(el('div', { className: 'report-section-body', text: body }));
    root.appendChild(sec);
  }

  function fillTemplate(tpl, data, t) {
    if (!tpl) return '';
    return tpl.replace(/\{([^}]+)\}/g, function (m, key) {
      // "day1_q1" のような形式
      var parts = key.split('_');
      var dayK = parts[0];
      var fieldK = parts.slice(1).join('_');
      var val = (state.answers[dayK] || {})[fieldK];
      if (Array.isArray(val)) {
        return val.filter(function (v) { return v && v.trim(); }).join('・');
      }
      return val ? String(val) : '';
    });
  }

  // ============================================================
  // オファー画面
  // ============================================================
  function renderOffer(root) {
    var t = TYPES[state.assignedType];
    if (!t) return renderInvalidType(root);

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

    var card = el('div', { className: 'card card-lg card-primary' });
    card.appendChild(el('div', {
      className: 'eyebrow', text: '— MASTER COURSE —', style: 'margin-bottom:8px;'
    }));
    card.appendChild(el('div', {
      className: 'page-title serif',
      text: COMMON.offerCourseName,
      style: 'font-size:19px; margin-bottom:16px;'
    }));
    card.appendChild(el('div', { className: 'offer-body', text: COMMON.offerBody }));

    var features = el('ul', { className: 'offer-features' });
    (COMMON.offerFeatures || []).forEach(function (f) {
      features.appendChild(el('li', { text: f }));
    });
    card.appendChild(features);

    var price = el('div', { className: 'offer-price' });
    price.appendChild(el('div', { className: 'offer-price-main', text: COMMON.offerPriceMonth }));
    price.appendChild(el('div', { className: 'offer-price-sub', text: COMMON.offerPriceYear }));
    card.appendChild(price);

    var btn = el('a', {
      className: 'btn btn-primary btn-block',
      href: CFG.courseUrl || '#',
      target: '_blank',
      rel: 'noopener',
      text: COMMON.offerBtn
    });
    btn.addEventListener('click', function () {
      if (!state.offerClicked) {
        state.offerClicked = true;
        saveState();
      }
      trackEvent('offer_clicked', {});
    });
    card.appendChild(btn);

    screen.appendChild(card);

    root.appendChild(screen);
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

    // 引き続き見られるもの
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
    var b3 = el('a', {
      className: 'btn btn-primary btn-block',
      href: CFG.courseUrl || '#',
      target: '_blank',
      rel: 'noopener',
      text: COMMON.offerBtn
    });
    list.appendChild(b3);
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

    bar.appendChild(el('span', { className: 'debug-tag', text: 'DEBUG' }));

    bar.appendChild(el('button', {
      type: 'button', text: 'reset', onclick: function () {
        if (!confirm('データをリセットしますか？')) return;
        resetState();
        location.reload();
      }
    }));

    ['A', 'B', 'C', 'D'].forEach(function (T) {
      bar.appendChild(el('button', {
        type: 'button', text: 'init ' + T, onclick: function () {
          resetState();
          state.assignedType = T;
          state.startedAt = nowIso();
          saveState();
          location.href = location.pathname + '?type=' + T + '&debug=1';
        }
      }));
    });

    bar.appendChild(el('button', {
      type: 'button', text: 'complete day1', onclick: function () {
        state.completedDays.day1 = true; saveState(); goto('home', { force: true });
      }
    }));
    bar.appendChild(el('button', {
      type: 'button', text: 'complete day2', onclick: function () {
        state.completedDays.day2 = true; saveState(); goto('home', { force: true });
      }
    }));
    bar.appendChild(el('button', {
      type: 'button', text: 'complete day3', onclick: function () {
        state.completedDays.day3 = true; state.cardCreated = true; saveState(); goto('home', { force: true });
      }
    }));
    bar.appendChild(el('button', {
      type: 'button', text: 'complete day4', onclick: function () {
        state.completedDays.day4 = true; state.reportGenerated = true; saveState(); goto('home', { force: true });
      }
    }));

    var typeTag = state.assignedType || '?';
    bar.appendChild(el('span', {
      className: 'debug-tag',
      text: 'type=' + typeTag + ' / ' + (CFG.testMode ? 'test' : 'normal')
    }));
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
