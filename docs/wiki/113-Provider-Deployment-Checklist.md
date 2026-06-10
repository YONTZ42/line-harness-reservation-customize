# 113. 事業者別デプロイ GitHub Environment チェックリスト

## 目的

事業者ごとに Cloudflare Worker / D1 / R2 / Pages を分けてデプロイするため、GitHub Environment に登録する値を整理する。

基本方針:

```text
開発者
  GitHub Environment と Cloudflare リソースを設定する。
  予約画面やメールの事業者別カスタムを実装する。

事業者
  console-v2 でLINE CRM、配信、フォーム、分析を使う。
  予約機能を使う場合は、管理画面でResource/Menu/Schedule/Slotを設定する。
```

## 必須

すべての事業者で必要。

### GitHub Secrets

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_D1_DATABASE_ID
API_KEY
LINE_CHANNEL_ACCESS_TOKEN
LINE_CHANNEL_SECRET
```

説明:

- `CLOUDFLARE_API_TOKEN`: GitHub Actions から Cloudflare へデプロイするために必要。
- `CLOUDFLARE_D1_DATABASE_ID`: 事業者専用D1へWorkerを接続するために必要。
- `API_KEY`: 管理画面からWorker APIを呼ぶために必要。
- `LINE_CHANNEL_ACCESS_TOKEN`: LINE Messaging API送信用。
- `LINE_CHANNEL_SECRET`: LINE webhook署名検証用。

### GitHub Variables


```text
CLOUDFLARE_ACCOUNT_ID
WORKER_NAME
CLOUDFLARE_D1_DATABASE_NAME
CLOUDFLARE_R2_BUCKET_NAME
CLOUDFLARE_PAGES_PROJECT_NAME
WORKER_URL
NEXT_PUBLIC_API_URL
```

説明:

- `WORKER_NAME`: 事業者ごとのWorker名。例: `line-harness-client-a`
- `CLOUDFLARE_D1_DATABASE_NAME`: 事業者ごとのD1名。
- `CLOUDFLARE_R2_BUCKET_NAME`: 画像保存用R2 bucket。
- `CLOUDFLARE_PAGES_PROJECT_NAME`: console-v2を含むWeb管理画面のPages project。
- `WORKER_URL`: Workerの公開URL。
- `NEXT_PUBLIC_API_URL`: Web管理画面が呼ぶWorker URL。通常は `WORKER_URL` と同じ。

## 基本的には入れる

LIFF、フォーム、予約導線を使うなら入れる。LINE CRMだけの最小導入では後回しでもよい。

### GitHub Secrets

```text
APP_ENCRYPTION_KEY
LINE_LOGIN_CHANNEL_SECRET
```

### GitHub Variables

```text
LIFF_URL
LINE_CHANNEL_ID
LINE_LOGIN_CHANNEL_ID
VITE_LIFF_ID
VITE_BOT_BASIC_ID
WEB_URL
NEXT_PUBLIC_WEB_URL
```

説明:

- `APP_ENCRYPTION_KEY`: D1に保存する顧客別秘密設定を暗号化する鍵。あとから変えると復号できなくなるため、初期導入時に入れるのが安全。
- `LINE_LOGIN_CHANNEL_SECRET`: LIFF / LINE Login 連携を使う場合に必要。
- `LIFF_URL`, `VITE_LIFF_ID`: LIFF予約画面やフォーム公開URLを使う場合に必要。
- `WEB_URL`, `NEXT_PUBLIC_WEB_URL`: メールやDiscord通知から管理画面URLを出す場合に使う。

## 予約機能を使う場合

予約画面を事業者向けに見せるための公開値。秘密ではないため GitHub Variables に置く。

```text
PROVIDER_ID
PROVIDER_NAME
PROVIDER_DISPLAY_NAME
PROVIDER_SHORT_NAME
PROVIDER_DESCRIPTION
PROVIDER_ADDRESS
PROVIDER_PHONE
PROVIDER_SITE_URL
PROVIDER_PRIMARY_COLOR
PROVIDER_ACCENT_COLOR
PROVIDER_BACKGROUND_COLOR
PROVIDER_TEXT_COLOR
PROVIDER_LOGO_URL
PROVIDER_HERO_IMAGE_URL
PROVIDER_FAVICON_URL
BOOKING_TITLE
BOOKING_INTRO_TITLE
BOOKING_INTRO_BODY
BOOKING_LINE_LINK_TITLE
BOOKING_LINE_LINK_BODY
BOOKING_ENABLE_CAFE_TAB
BOOKING_ENABLE_LINE_LINK_PANEL
```

予約機能を使わない場合、これらは未設定でもよい。未設定ならWorker側のProvider defaultにfallbackする。

## メールを使う場合

予約完了メール、通知メール、フォーム通知などを使う場合だけ設定する。

### GitHub Secrets

```text
RESEND_API_KEY
RESEND_FROM_EMAIL
RESEND_FROM_NAME
```

### GitHub Variables

```text
EMAIL_FROM_NAME
EMAIL_FOOTER_TEXT
EMAIL_HERO_IMAGE_URL
```

メールを使わない場合、`RESEND_*` は不要。実装上、Resend API keyがない場合は予約作成自体を失敗扱いにしない。

## Google OAuth / Calendar を使う場合

Google Calendar連携、Gmail取り込み、Google OAuthを使う場合だけ設定する。

### GitHub Secrets

```text
GOOGLE_OAUTH_CLIENT_SECRET
```

### GitHub Variables

```text
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_REDIRECT_URI
VITE_CALENDAR_CONNECTION_ID
```

予約機能を使わない場合、またはGoogle連携なしで予約だけ使う場合は不要。

## 外部予約メール取り込みを使う場合

じゃらん/Gmailなどの外部予約メール取り込みを使う場合だけ設定する。

```text
EXTERNAL_IMPORT_ENABLED
EXTERNAL_IMPORT_LABEL
EXTERNAL_IMPORT_PROVIDER
EXTERNAL_IMPORT_DEFAULT_FROM_EMAIL
EXTERNAL_IMPORT_DEFAULT_QUERY
```

外部予約連携を使わない場合:

```text
EXTERNAL_IMPORT_ENABLED=false
```

## Discord通知を使う場合

Discord通知を使う場合だけ GitHub Secrets に入れる。

```text
DISCORD_WEBHOOK_URL
DISCORD_RESERVATION_WEBHOOK_URL
DISCORD_DAILY_WEBHOOK_URL
DISCORD_REVIEW_WEBHOOK_URL
```

通知を使わない場合は不要。

## Worker Secret運用

Cloudflare Secrets Store は使わない。

`deploy-worker.yml` は GitHub Environment Secrets から次のWorker secretsを同期する。

通常の Worker Secret は、実行時には `c.env.API_KEY` のようなbindingとして読める。アプリ側の `resolveBindingValue()` は通常の文字列secretと、古いSecrets Store bindingの両方を読めるが、新規事業者では通常の Worker Secret を使う。

```text
API_KEY
APP_ENCRYPTION_KEY
LINE_CHANNEL_ACCESS_TOKEN
LINE_CHANNEL_SECRET
LINE_LOGIN_CHANNEL_SECRET
GOOGLE_OAUTH_CLIENT_SECRET
RESEND_API_KEY
RESEND_FROM_EMAIL
RESEND_FROM_NAME
DISCORD_WEBHOOK_URL
DISCORD_RESERVATION_WEBHOOK_URL
DISCORD_DAILY_WEBHOOK_URL
DISCORD_REVIEW_WEBHOOK_URL
IG_HARNESS_LINK_SECRET
```

空の値はskipされる。ただし、`API_KEY`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET` は必須。

## 事業者追加手順

```text
1. Cloudflareで事業者用 Worker / D1 / R2 / Pages を作る。
2. GitHub Environment を作る。例: production-client-a
3. 必須Secretsと必須Variablesを登録する。
4. 予約、メール、Google、Discordを使う場合だけ任意設定を追加する。
5. Deploy Worker workflow を environment=production-client-a で実行する。
6. Migrate D1 workflow を environment=production-client-a で実行する。
7. Deploy Web workflow を environment=production-client-a で実行する。
8. LINE Developers の Webhook URL を `https://<worker>/webhook` に設定する。
9. `/api/public/provider-config` と `/console-v2` を確認する。
```
