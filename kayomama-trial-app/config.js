/**
 * ============================================================
 * かよママさん「あなたの台所を軽くする4日間」
 * config.js — 運営者が編集する設定ファイル
 * ============================================================
 *
 * ここだけ書き換えれば、アプリの主要な挙動を変更できます。
 * app.js / content.js / styles.css は基本触らないでください。
 *
 * ------------------------------------------------------------
 * 変更頻度が高い項目：
 *   - welcomeVideoUrl / offerVideoUrl … 動画URL
 *   - courseUrls  … 4サービスそれぞれの案内・申込みURL
 * ------------------------------------------------------------
 */
window.APP_CONFIG = {
  // アプリの表題（ホーム画面ヘッダー等に表示）
  appTitle: "あなたの台所を軽くする4日間",

  // ウェルカム動画のURL（YouTube埋め込みURL or 直接mp4）
  // 空文字列にすると、動画枠自体を表示しません
  welcomeVideoUrl: "",

  // オファー動画のURL（4日間終了後・レポート後・コース説明前に表示）
  // 空文字列にすると、動画タイトル・枠とも表示しません
  offerVideoUrl: "",

  // 4サービスそれぞれの案内・申込みURL
  //   content.js の services.<name>.urlKey に対応
  courseUrls: {
    homelovedKitchen: "https://example.com/homeloved-kitchen",  // ほめられキッチン
    kondate:          "https://example.com/kondate",             // 献立サポート
    ajitsuke:         "https://example.com/ajitsuke",            // 味付けサポート
    koji:             "https://example.com/koji"                 // 麹サポート
  },

  // 何かあった時の問い合わせ先URL（未使用でも空でOK）
  supportUrl: "",

  // ----- 通常モードの時間設定 -----
  unlockIntervalHours: 24,          // 次の日解放までの時間
  appAvailableHours: 120,           // 有効期間（120時間=5日）

  // ----- テストモード -----
  testMode: false,                  // true にすると分単位で動く
  testUnlockIntervalMinutes: 1,
  testAppAvailableMinutes: 10,

  // localStorage キー
  storageKey: "kayomama_trial_v2",

  // ============================================================
  // GAS Web App 連携（ユーザー管理スプシとの通信）
  // ============================================================
  //   これを設定すると、アプリの挙動が自動でスプシに記録され、
  //   uid付きURL（?uid=xxx）で開いたユーザーは
  //   自動でタイプ引当されて該当タイプ画面が表示されます。
  //
  //   空文字列のままなら、GAS連携は完全にオフ（従来通り動く）
  gasWebhookUrl: "https://script.google.com/macros/s/AKfycbwyy_kIboj_EnyxbJSIhPFlUJOgITE1iSBMoHGLyoDyaMGkfbNd7PNaFf91xMnI-ZTb/exec",
  gasToken:      "kayomama-app-tk8n3r5p2x9m7w4"
};

