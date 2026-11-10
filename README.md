# にじさんじデータベース（初期UI版）

iPhone優先で設計した非公式・個人制作Webアプリの初期プロジェクトです。React + TypeScript + Viteを使用します。

**注意：現段階の収録ライバー・動画・衣装・楽曲はすべて架空のデモデータです。実際の公式情報収集、YouTube API連携、30分ごとのライブ監視は未実装です。一般公開用の完成版ではありません。**

## 起動

Node.js 22以降を推奨します。

```bash
npm install
npm run dev
```

ブラウザで Vite の表示するURL（通常 `http://localhost:5173/`）を開きます。

## 検証・ビルド

```bash
npm run build:index
npm run validate:data
npm run build
```

## データ

- `public/data/livers/*.json` : ライバーごとのデータファイル（現在は架空の4件）
- `public/data/generated/index.json` : 上記から生成される、画面が読み込む一覧JSON
- `src/types.ts` : データ型定義
- `scripts/build-index.mjs` : 個別JSONから一覧データを生成
- `scripts/validate-data.mjs` : JSONの最低限の整合性確認

アプリは初回起動時にJSONを取得し、ローカルキャッシュを表示したうえで公開JSONを再取得します。データが入手できない場合はエラーを表示します。

## GitHub Pages

`main` にプッシュすると `.github/workflows/pages.yml` が検証・ビルド・Pagesへのデプロイを試みます。リポジトリの **Settings → Pages → Build and deployment → Source = GitHub Actions** を設定してください。

公開URLやGitHubリポジトリはまだ作成していません。

## 実装済み

- ホーム：検索、登録件数、近い誕生日、最近の更新（デモ）
- 一覧：検索、JP/EN、デビュー年、デビュー順/名前順、カード/リスト
- 個別ページ：基本情報、全文紹介、YouTube最新2件/5件、タブ4種
- ビジュアル：2D/3D、古い順、差分選択・スワイプ、YouTubeリンク欄
- 音楽：分類、公開日順切替、複数参加者、動画リンク欄
- 活動履歴：カテゴリ・年・並び替え、関連情報へ移動
- 設定：ライト/ダーク、更新情報欄、非公式表示

## 今後の実装（初期公開までに必要）

1. 公式情報から現役ライバー全員のデータを作成し、データ内容と引用・画像利用の可否を確認する
2. 公式YouTubeチャンネルIDを収集し、YouTube Data APIで最新動画・配信予定を取得する仕組みを構築する
3. YouTube新着12時間、ライブ状態30分を目標にGitHub Actionsを構成し、APIクォータとスケジュール遅延を検証する
4. 正確な出典・項目別変更履歴管理、データ検証レポート、正常公開版の維持を強化する
5. 公式画像の使用ガイドラインを確認し、利用可能な画像を登録する

この段階でリポジトリ名、実データ、APIキーの登録作業は行っていません。
