// ============================================================
// かよママ動画アプリ 設定
// ============================================================

// GAS Web App URL（既存のかよママ管理アプリと同じ）
window.GAS_URL = 'https://script.google.com/macros/s/AKfycbwyy_kIboj_EnyxbJSIhPFlUJOgITE1iSBMoHGLyoDyaMGkfbNd7PNaFf91xMnI-ZTb/exec';
window.GAS_TOKEN = 'kayomama-app-tk8n3r5p2x9m7w4';

// 動画一覧（初期モックデータ ― 実データは GAS API `list_videos` で取得予定）
// 88件あるうちの一部サンプル。Vimeo URL は仮。
window.MOCK_VIDEOS = [
  { no: 1,  month: '2023年11月', title: 'アメリカ人の義理姉直伝キャロットケーキ', duration: '45:47',    vimeoUrl: '', recipeUrl: '', series: '' },
  { no: 2,  month: '2023年11月', title: 'ローストポーク／かぼちゃのポタージュ／きのこのまぜごはん', duration: '1:35:29', vimeoUrl: '', recipeUrl: '', series: '' },
  { no: 3,  month: '2023年12月', title: 'ローストビーフ', duration: '2:14:26', vimeoUrl: '', recipeUrl: '', series: '' },
  { no: 4,  month: '2023年12月', title: 'ピザ生地成型リベンジ', duration: '11:04', vimeoUrl: '', recipeUrl: '', series: '' },
  { no: 5,  month: '2024年1月',  title: 'ブリの照り焼き', duration: '59:59',    vimeoUrl: '', recipeUrl: '', series: '家で料亭の味' },
  { no: 6,  month: '2024年1月',  title: '豚汁／春菊とイチゴのサラダ', duration: '55:10', vimeoUrl: '', recipeUrl: '', series: '自分史上最高' },
  { no: 7,  month: '2024年2月',  title: 'サーモンと日向夏のマリネ／手鞠寿司ネタ仕込みまで', duration: '57:53', vimeoUrl: '', recipeUrl: '', series: '' },
  { no: 8,  month: '2024年2月',  title: '手鞠寿司の成型、瓦そば', duration: '1:02:07', vimeoUrl: '', recipeUrl: '', series: '' },
  { no: 9,  month: '2024年3月',  title: '肉じゃが／幽庵焼き・鯛のカルパッチョ【前半】', duration: '56:53', vimeoUrl: '', recipeUrl: '', series: '自分史上最高' },
  { no: 10, month: '2024年3月',  title: '肉じゃが／幽庵焼き・鯛のカルパッチョ【後半】', duration: '58:00', vimeoUrl: '', recipeUrl: '', series: '' },
  { no: 11, month: '2024年4月',  title: '春の炊き込みご飯／筍と鶏の煮物', duration: '1:12:00', vimeoUrl: '', recipeUrl: '', series: '' },
  { no: 12, month: '2024年4月',  title: '桜えびのかき揚げ／若竹煮', duration: '55:30', vimeoUrl: '', recipeUrl: '', series: '家で料亭の味' }
];

window.APP_VERSION = '0.1.0';

