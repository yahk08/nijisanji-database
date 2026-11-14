# にじデータベース — 公式情報先行収録・試用版（2026-11-14）

既存の React + TypeScript + Vite の `nijisanji-database` を上書きするための更新パッケージです。GitHub Pages の公開URLは変更しません。

## この版で使えること
- ホームの5セクション（データ未収集部分は空状態を明示）
- ライバー一覧、検索、2列カード／リスト、所属・デビュー年フィルタ、並び替え、ランダム再シャッフル
- 公式出典の確認できた3人（月ノ美兎・叶・葛葉）の個別プロフィール・公式リンク
- お気に入り登録と一覧上部の表示（この端末の保存領域に保存）
- YouTube欄、ビジュアル・音楽・活動履歴3タブ（未収録データは空表示）
- 公式ストア掲載名の照合候補172件（公式ストア170件＋公式デビュー発表2件、うち個別プロフィール未照合169件）
- 設定画面の公開データ再読み込み

**未完成の先行試用版です。** 現役ライバー全員の公式プロフィールURLの照合・YouTube自動取得・公式ニュース/イベント/音楽/衣装収集・本番公開判定はまだ未完了です。「公式ストア掲載」は現役所属の確定を意味しません。

## データの根拠
- 公式ストア一覧（掲載名170件、確認日：2026-11-14）：https://shop.nijisanji.jp/search/artist?cgid=nijisanji
- 2026年8月27日デビュー発表（神永タイガ・山田龍一郎）：https://www.nijisanji.jp/news/09g_6vw10r
- 月ノ美兎：https://www.nijisanji.jp/talents/l/mito-tsukino ／ https://shop.nijisanji.jp/1002
- 叶：https://www.nijisanji.jp/talents/l/kanae ／ https://shop.nijisanji.jp/1019
- 葛葉：https://www.nijisanji.jp/talents/l/kuzuha ／ https://shop.nijisanji.jp/1042

ライバーID `TMP_*` は正式なデビュー日順の採番が完了する前の**暫定ID**です。全員の公式情報照合後に固定IDを決定します。公式画像は未収録です。

## GitHub Desktopへの反映
1. 念のため現在の `main` の状態を保存してから、ZIPを展開します。
2. ZIP内の**ファイルとフォルダを、既存リポジトリのルートに上書きコピー**します。`src`、`public`、`scripts` などは既存と同じ階層に置いてください。
3. 古い `public/data/livers/demo_001.json` ～ `demo_004.json` はGitHub Desktop上で削除してください。仮に残っても、新しい `build-index.mjs` はデモファイルを公開対象から除外します。
4. GitHub Desktopで変更内容を確認し、Commit → Pushします。`.github/workflows/pages.yml` がビルド・検証・Pages公開を試行します。
5. Actions の成否と GitHub Pages の表示を確認してください。失敗した場合は公開成功とみなさないでください。

## 動作確認（PC）
```bash
npm install
npm run build:index
npm run validate:data
npm run build
```

## 次の実装課題
- 現役ライバー一覧との全件照合（NIJISANJI ENを含む公式分類の確認）
- ライバーごとの個別公式プロフィールURL、出典、デビュー日、YouTubeチャンネルの収集
- GitHub Actions経由のYouTube API更新・安全なデータ公開
- 公式情報のニュース、イベント、衣装、楽曲の逐次収集
- iPhone実機 Safari／PWA での検証
