# かよママ管理アプリ (kayomama-admin)

かよママさん専用のPWA管理ダッシュボード。
先行予約が入るとiPhoneに通知が届いて、受講者の進捗も見られる。

## 配置

GitHub Pages に上げて `https://apps.l-mine.com/kayomama-admin/` でアクセス。

## セットアップ手順（かよママさん側）

1. Safari で `https://apps.l-mine.com/kayomama-admin/?t=<ADMIN_TOKEN>` にアクセス
2. 「共有」→「ホーム画面に追加」でアイコンをホーム画面に置く
3. アプリを開く → 通知許可 → FCMトークンが自動登録される
4. 完了。以降は先行予約が入るたびに通知が届く

`?t=<ADMIN_TOKEN>` は初回だけ必要（localStorage に保存されるので、以後は不要）。
とーるさんがGAS `setupAdminSecrets()` を実行して発行したトークンを URL に含める。

## 画面構成

- **ホーム**: 未対応の先行予約数 / 登録ユーザー数 / 進捗ファネル
- **受講者**: 全ユーザーの一覧、タップで詳細（イベント履歴付き）
- **先行予約**: 予約一覧、タップで詳細＋ステータス変更（新規/連絡済/成約/キャンセル）＋メモ
- **設定**: 管理トークン確認 / 通知テスト / ログアウト

## ファイル構成

```
kayomama-admin/
├── index.html                  # エントリ
├── app.js                      # 本体
├── styles.css                  # スタイル
├── config.js                   # GAS_URL, ADMIN_TOKEN, FIREBASE_CONFIG, VAPID
├── manifest.json               # PWA
├── service-worker.js           # PWAキャッシュ
├── firebase-messaging-sw.js    # FCM バックグラウンド受信
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
└── README.md
```

## GAS API 依存

- `admin_stats` … サマリー
- `admin_list_users` … ユーザー一覧
- `admin_get_user` … 個別詳細＋イベント履歴
- `admin_list_reservations` … 先行予約一覧
- `admin_update_reservation` … 予約ステータス更新
- `admin_register_token` … FCMトークン登録
- `admin_test_push` … 動作確認用

すべて `admin_token` パラメータで認証。

## テスト

1. 設定タブの「テスト通知を送る」で自分にPush確認
2. トライアルアプリで先行予約ボタン → 通知＋先行予約タブに反映

## 注意

- `config.js` の `ADMIN_TOKEN` はプレースホルダー。GitHubに公開する場合はURL方式で運用。
- Firebase SpackプランなのでFCM無料枠内で運用可能。
