// ============================================================
// かよママ管理アプリ 設定
// ============================================================

// GAS Web App URL（トライアルアプリと同じもの）
window.GAS_URL = 'https://script.google.com/macros/s/AKfycbwyy_kIboj_EnyxbJSIhPFlUJOgITE1iSBMoHGLyoDyaMGkfbNd7PNaFf91xMnI-ZTb/exec';

// 管理者トークン（GAS setupAdminSecrets() 実行時のログから取得して貼り付け）
window.ADMIN_TOKEN = 'admin-c61fc1f6d1b44a828032';

// Firebase Web SDK 設定（Firebase Console > プロジェクト設定 > 全般 > SDK設定）
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCxYGRBN2laaY0KOmSkxzutdMCIc4_FXYU',
  authDomain: 'kayomama-admin.firebaseapp.com',
  projectId: 'kayomama-admin',
  storageBucket: 'kayomama-admin.firebasestorage.app',
  messagingSenderId: '1092542902975',
  appId: '1:1092542902975:web:554a1b86f2f826b36fcc0a'
};

// FCM Web Push 証明書（VAPID Key）
window.FCM_VAPID_KEY = 'BB-lAiUem7A-yQIfc_D498UcayyYYuy0JZVsbY9gC6r8g_S3fagjRBEdI9vuRqSy1Iw189cjFt4OBAreAHxviXQ';

// アプリのバージョン（キャッシュバスター）
window.APP_VERSION = '1.1.1';
