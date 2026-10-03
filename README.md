# Misskey Markov

Misskeyの自分の公開ノートを取得し、マルコフ連鎖で文章を生成するサイトです。Node.jsのサーバーとブラウザの画面で動きます。外部の文章生成APIやデータベースは使いません。

## Docker Composeで起動

GitHub ActionsでビルドしたイメージをGHCRに公開します。`linux/amd64` と `linux/arm64` に対応します。

`compose.yaml`:

```yaml
services:
  app:
    image: ghcr.io/rassi0429/misskey-markov-chein:latest
    restart: unless-stopped
    init: true
    ports:
      - "127.0.0.1:3210:3210"
    environment:
      PUBLIC_URL: ${PUBLIC_URL:-http://localhost:3210}
    read_only: true
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
```

```sh
docker compose pull
docker compose up -d
```

ローカルでは http://localhost:3210 を開きます。ホストの3210番ポートはループバックにだけ公開します。コンテナ内では `0.0.0.0:3210` で待ち受けます。

### 公開ドメインで使う

Composeと同じディレクトリに `.env` を作り、ブラウザで開くURLを指定します。

```dotenv
PUBLIC_URL=https://markov.example.com
```

Nginx、CaddyなどでHTTPSを終端し、`127.0.0.1:3210` にリバースプロキシしてください。`PUBLIC_URL` はMiAuthのコールバックURL、リクエストのHost/Origin検査、CookieのSecure属性に使います。サブパスでの公開は未対応です。

Nginxの転送設定例（証明書設定などを含むHTTPSの `server` ブロック内）:

```nginx
location / {
    proxy_pass http://127.0.0.1:3210;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

`Host` は公開ドメインを保ってください。Nginxもコンテナで動かす場合は同じDockerネットワークに接続し、転送先を `http://app:3210` に変更します。

環境変数を変更したらコンテナを再作成します。

```sh
docker compose up -d --force-recreate
```

更新は次のコマンドで行います。

```sh
docker compose pull
docker compose up -d
```

再起動・更新で認証と学習データは消えます。

### 環境変数

| 変数 | 必要な場面 | 既定値 | 用途 |
| --- | --- | --- | --- |
| `PUBLIC_URL` | 公開運用では設定必須 | `http://localhost:3210`（`PORT`に追従） | ブラウザから開くURL。例: `https://markov.example.com`。パス・クエリ・認証情報は付けず、公開ドメインではHTTPSを使用 |
| `HOST` | 通常は変更不要 | 直接起動: `127.0.0.1`、Docker: `0.0.0.0` | サーバーの待受アドレス |
| `PORT` | 通常は変更不要 | `3210` | サーバーの待受ポート。変更時はComposeのコンテナ側ポートも合わせる |
| `NODE_ENV` | 設定不要 | Docker: `production` | Node.jsの実行環境。コンテナ側で設定済み |

APIキー・Misskeyのクライアントシークレット・データベース接続情報は不要です。認証は利用者ごとのMiAuthで行います。

### 自分でDockerビルドする

```sh
docker build -t misskey-markov-chein:local .
docker run --rm -p 127.0.0.1:3210:3210 misskey-markov-chein:local
```

イメージ内ではroot以外の `node` ユーザーで動きます。`/healthz` がヘルスチェック用エンドポイントです。

## GitHub Actions

[Docker workflow](.github/workflows/docker.yml) でテスト後にイメージをビルドします。

- `main` へのpush: GHCRに `latest`、`main`、`sha-…` タグを公開。
- `v1.2.3` のようなタグへのpush: `1.2.3`、`1.2`、`sha-…` タグを公開。
- Pull Request: テストとビルドだけを実行し、イメージは公開しません。
- Actions画面から手動実行もできます。

GHCRへのpushにはActionsが自動発行する `GITHUB_TOKEN` を使います。追加のシークレット登録は不要です。リポジトリ設定でActionsを有効にしてください。

GHCRのパッケージは初回公開時にPrivateで作成される場合があります。認証なしでpullするには、GitHubのパッケージ設定でVisibilityをPublicにします。Privateのまま利用する場合は、`read:packages` 権限のあるトークンでGHCRにログインしてください。[GitHubのContainer registryの説明](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)

## ローカル開発

Node.js 22以上。コンテナとCIではNode.js 24を使います。外部パッケージのインストールは不要です。

```sh
git clone https://github.com/rassi0429/misskey-markov-chein.git
cd misskey-markov-chein
npm run dev
```

http://localhost:3210 を開きます。`pnpm dev` でも起動できます。

## 使い方

サーバードメインを入力し、「Misskeyと連携する」でMiAuthを許可します。権限は `read:account` のみ。戻ったら「ノートを取得する」を押してください。取得は100件ずつ、応答が返ったら次を取得し、APIが空の一覧を返すまで進めます。中断やAPIエラー後は同じセッション内で再開できます。

公開ノート（`visibility: public`）の本人の本文のみを学習します。他人のリノート本文・画像・投票・CWの見出しは学習しません。公開の返信・チャンネルは取得対象です。ホーム・フォロワー限定・ダイレクトは対象外です。ノート取得APIに認証トークンは送らず、返された一覧から公開ノートだけを選びます。削除済みやAPIで提供されないノートは取得できません。

「生成する」を押すと、1〜3語の文脈から次の単語を出現頻度で選びます。日本語分割はNode.js標準の `Intl.Segmenter`、マルコフ連鎖は `markov.mjs` の自前実装です。完全一致の元ノートは出力しませんが、元のノートの断片が出る可能性はあります。MFMの除去は簡易処理です。

カスタム絵文字（`:名前:`）の候補は、通常の単語の5倍の重みで選びます。学習した文脈の候補にある絵文字だけが対象で、絵文字を後から足す処理はありません。実際の出現率は元ノートや語数の設定によって変わります。

生成結果をコピーするか、カード右上の「投稿画面を開く」を使います。履歴の各文章からも投稿画面を開けます。共有フォームには本文、`#マルコフ連鎖`、`https://markov.kokoa.dev/` の順に改行して入力されます。Misskey側でログイン中のアカウントを確認し、公開範囲を選んで投稿してください。投稿APIや追加の投稿権限は使いません。

## データの扱い・制限

- トークン・本文・学習モデルはメモリのみ。削除ボタン、サーバー再起動、24時間の未使用で消えます。ブラウザにはセッションIDだけをHttpOnly Cookieに保存します。公開URLがHTTPSならSecure属性を付けます。
- Cookieの有効期間は24時間。継続保存・複数端末間の同期は未実装です。
- セッションをサーバー内に保持するので、1インスタンスで運用してください。
- 全ノートをメモリに保持し、生成の学習処理は同じNode.jsプロセスで行います。ノート数と利用者数に応じてメモリ使用量・応答時間が増えます。利用者別の容量制限は未実装です。
- 任意ホストへの接続はHTTPSの公開IPv4宛に限定し、DNS解決時に内部IPを拒否します。IPv6のみのサーバーは未対応です。
- Misskey側の連携許可を失効するには、Misskey設定のAPI/連携アプリから削除してください。このサイトの削除ボタンはサーバー内のデータだけを削除します。

## 検証

```sh
npm test
```

日本語分割、生成・元文一致除外、公開ノートの絞り込み、接続先制限、セッション分離、削除、CSRF拒否、公開URL設定、共有フォームへの本文とハッシュタグの引き渡しを検証します。

実アカウントでのMiAuth・全件取得は本人の認証操作が必要です。
