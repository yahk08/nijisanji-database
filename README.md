# にじデータベース — 172人プロフィール・YouTube連携・iPhone PWA

2026年11月14日の指定公式一覧172人を個別プロフィールと照合しました。既存29人のIDを維持し143人追加。Wiki由来情報・未確認情報を区別しています。

- [GitHub Desktopでの導入・Secrets設定・iPhone確認](docs/導入手順.md)
- [収集件数と検証結果、未対応事項](docs/収集・検証レポート.md)
- [YouTube / Xの調査と制限](docs/外部連携調査.md)

YouTubeは12時間の新着取得と30分の取得済み配信状態確認を実装。キー設定後に動作します。新規配信枠は上限に合わせて順番に検索するため、全員の配信予定を30分ごとに網羅するものではありません。Xは公式リンクを使用します。

```sh
npm ci
npm run build:index
npm run validate:data
npm run validate:roster
npm test
npm run build
npm run preview
```

`TMP_*` を含む既存IDは固定です。今後も改名・再採番しないでください。元データは `public/data/history/baseline-437faaa.json`、照合一覧は `roster-review.csv` に収録しています。

この成果物作成時にGitHubへの書き込みや公開はしていません。iPhone実機および実API確認は未実施です。非公式のファン制作アプリでありANYCOLOR公式サービスではありません。

以前のREADMEは経緯保存用に `docs/history/README-before-172.md` に残しています。現行の仕様・手順は上記3文書を参照してください。
