# drawio-poc

公式 [draw.io (diagrams.net)](https://github.com/jgraph/drawio) を、**完全閉域環境の IIS で静的ファイルのみで動かす**ための PoC です。
独自のエディタは実装せず、公式の `src/main/webapp` を固定バージョンで取り込み、設定ファイルの差し替えだけで閉域向けにしています。

| 項目 | 内容 |
| --- | --- |
| draw.io バージョン | **v32.4.1** (コミット `9034053fba80a435e27d68d374bc564b83917ae9`) — 固定値は [`drawio-version.env`](drawio-version.env) |
| 取得元 | https://github.com/jgraph/drawio (タグ `v32.4.1`) |
| GitHub Pages | https://yantkys.github.io/drawio-poc/ |
| IIS 用 ZIP | `drawio-poc-iis.zip` (GitHub Actions の Artifact) |
| ライセンス | draw.io: Apache License 2.0。公式の `LICENSE` と [`NOTICE.txt`](NOTICE.txt) を配布物 (`dist/`・ZIP) に同梱 |

## リポジトリ構成

```
drawio-version.env     取り込む公式バージョン (タグ + コミットSHA)。更新時はここだけ変更
scripts/build.sh       公式ソース取得 → dist/ 生成 → drawio-poc-iis.zip 生成
config/PreConfig.js    公式 js/PreConfig.js の差し替え (閉域設定・日本語既定)
config/PostConfig.js   公式 js/PostConfig.js (内容は公式と同一)
config/csp.txt         index.html に挿入する Content-Security-Policy
config/web.config      IIS 用設定 (MIME・キャッシュ)
tests/                 Playwright スモークテスト (配信物には含まれない)
.github/workflows/     ビルド・検証・Pages デプロイ
```

公式ソースはリポジトリにコミットしません。ビルド時に固定タグから取得し、コミット SHA が一致しない場合はビルドを失敗させます。

## 公式ファイルに対する変更点

配布物 (`dist/`) と公式 `src/main/webapp` との差分は次のとおりです。これ以外は無改変です。

- **除外**: `WEB-INF/`・`META-INF/`・`connect/`・`service-worker.js`・`workbox-*`・`dropbox.html`・`github.html`・`gitlab.html`・`onedrive3.html`・`teams.html`・`monday-app-association.json`・`js/integrate.min.js` (閉域では使わないクラウド連携・PWA・Java 用資材)
- **差し替え**: `js/PreConfig.js`、`js/PostConfig.js` (公式が用意している設定ファイル)
- **追加**: `web.config`、`NOTICE.txt`、`BUILD-INFO.txt`
- **挿入**: `index.html` に CSP の `<meta>` を 1 行 (外部通信の遮断。ビルド時に `scripts/build.sh` が挿入)

## GitHub Actions

[`.github/workflows/pages.yml`](.github/workflows/pages.yml)

| トリガー | 実行内容 |
| --- | --- |
| Pull Request (main 向け) | ビルド、スモークテスト、ZIP 検証。デプロイはしない |
| main への push / 手動実行 (`workflow_dispatch`) | 上記に加えて GitHub Pages へデプロイし、公開 URL に対して同じスモークテストを実行 |

`build` ジョブの流れ: `scripts/build.sh` → `/drawio-poc/` のサブパスで配信して Playwright (Chromium) 実行 → ZIP を展開して `dist/` と完全一致を確認し、仮想ディレクトリ配下でも再実行 → ZIP / テストレポートを Artifact 化。

### GitHub 側で必要な設定 (初回のみ)

1. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にする。
2. PR をマージ (または Actions タブから `build-and-deploy` を main で手動実行)。

## IIS 用 ZIP の取得と配置

1. Actions の実行結果 (`build-and-deploy`) の **Artifacts → `drawio-poc-iis`** をダウンロードし、展開して `drawio-poc-iis.zip` を取り出す。
2. IIS の公開フォルダ (例: `C:\inetpub\wwwroot\drawio-poc`) に、ZIP を**そのまま展開**する (`index.html` と `web.config` が直下に来る)。
3. IIS マネージャーでサイトまたは仮想ディレクトリ/アプリケーション (例: `/drawio-poc`) として公開し、`https://<サーバー>/drawio-poc/` を Edge で開く。

要件: 静的コンテンツ (Static Content) の役割サービスのみ。ビルド・インターネット接続・.NET/Java/Node.js/Python は不要です。
ファイル参照はすべて相対パスのため、サイト直下でも仮想ディレクトリでも動作します。`web.config` は JSON/SVG/TTF の MIME 登録と、更新後に古いファイルが使われないよう毎回再検証 (304) させる設定のみです。他の `web.config` と競合する場合は該当箇所をマージしてください。

## 閉域環境への対応方針

公式の構成機構を使い、**設定は `config/PreConfig.js` に集約**しています。URL パラメータだけに依存せず、`?offline=1&gapi=1` のような指定でも解除されません (テストで確認)。

| 対象 | 対応 |
| --- | --- |
| クラウド保存 (Google Drive / OneDrive / Dropbox / GitHub / GitLab / Trello) | `lockdown=1`・`stealth=1` を固定。公式実装が各連携を無効化し、SDK も読み込まない |
| 保存先 | `mode=device`。Edge では「名前を付けて保存」でローカルファイル (`.drawio`)、非対応環境ではダウンロード |
| 外部 API (AI 連携) | `enableAi: false` |
| ログ送信・リアルタイム同期 | lockdown/stealth により無効 |
| サーバー側変換 | `EXPORT_URL = null`。PNG / SVG はブラウザ内で生成、PDF は印刷ダイアログ |
| アイコン検索 | `PostConfig.js` で `ICONSEARCH_PATH`/`ICON_SERVICE_PATH` を `null` (公式既定) |
| プラグイン | `plugins=0` 固定、`p=` 指定は破棄 |
| PWA / サービスワーカー | 使用しない。配布物に `service-worker.js` を含めず、`pwa=0`・`enableSW=0` を固定 |
| 外部フォント・画像 | CSP (`default-src 'self'`、`img-src 'self' data: blob:`、`connect-src 'self'` など) でブラウザ側でも遮断 |
| 言語 | 既定は日本語。`?lang=` と、利用者が設定で選んだ言語は優先 |

**`offline=1` を採用しなかった理由**: 公式実装 (`Editor.js`) では `offline=1` が**サービスワーカーの登録を有効にする**ため、PWA を使わない方針と矛盾します。`offline=1` は PreConfig で破棄しています。クラウド連携の無効化は `lockdown`/`stealth` で同等に実現できます。

**`local=1` を採用しなかった理由**: `localStorage` を使わなくなり、言語などの設定が保存されなくなるためです。

## 動作確認

### 自動 (Playwright / Chromium)

```bash
scripts/build.sh                 # dist/ と drawio-poc-iis.zip を生成
npm ci
npx playwright install chromium  # 初回のみ
npm test                         # dist を http://127.0.0.1:4173/drawio-poc/ で配信して検証
```

検証内容 (`tests/smoke.spec.js`): 日本語 UI での起動、図形の配置・移動・日本語テキスト編集、線による接続、図形ライブラリの追加と検索、`.drawio`/`.xml` のローカル保存と再読込、PNG/SVG エクスポート、`index.html` の参照先の存在。
**すべてのテストで次を同時に検証**します: 同一オリジン以外へのリクエストがない / HTTP 4xx・5xx がない (=サブパスで 404 がない) / CSP 違反 (=外部通信の試行) がない / ページエラーがない / サービスワーカー未登録。

外部通信は CSP を外した状態でも発生しないことを確認済みです (CSP は二重の防御)。検出の仕組み自体も自己確認テストで検証しています。

公開済みサイトに対して実行する場合: `BASE_URL=https://yantkys.github.io/drawio-poc/ npm test`

### 手動 (IIS 実機)

1. Edge で `https://<サーバー>/drawio-poc/` を開き、日本語 UI で起動することを確認する。
2. 開発者ツール (F12) → ネットワーク で、起動時と図の編集・保存・エクスポート時に、IIS 以外への通信と 404 がないことを確認する。
3. 図形の配置・接続・テキスト編集、ファイル → 名前を付けて保存 (`.drawio`)、保存ファイルを 次から開く → デバイス で再読込、形式を指定してエクスポート → PNG / SVG を確認する。
