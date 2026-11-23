# Excelプロフィール更新

`scripts/update-profile-workbook.py` はPython標準ライブラリのみで動作します。
リポジトリ直下で実行してください。

```sh
python scripts/update-profile-workbook.py input.xlsx --report preview.json
python scripts/update-profile-workbook.py input.xlsx --apply --plan preview.json --report applied.json
npm run build:index
npm run validate:data
npm run validate:roster
npm test
npm run build
```

空欄は既存値を保持します。非空欄のプロフィール値はExcelを優先します。
公式プロフィールURLと名前で全員を照合し、不一致・重複・不正なURLや日付は書込前に停止します。
適用にはソースExcelのSHA-256、既存JSONのSHA-256、更新内容が一致するドライランが必要です。
全員のJSONは `.profile-backups` に保存します。部分書込失敗時は元データへ戻します。
バックアップはGitの対象外なので別途保管してください。

ID、公式プロフィールURL、所属branch、衣装・差分、楽曲、活動履歴、配信情報、既存変更履歴は保持します。
衣装等のシートが非空欄の場合は、このプロフィール専用ツールは停止します。
所属は `profileBranch` に別保存し、既存 `branch` の分類を変更しません。
誕生日の「秘密」「毎日」は日付ではなく表示状態として保存します。
Excelの8桁数値デビュー日はYYYY-MM-DDへ変換します。
Excel取込は公式サイト再検証ではないため、変更した値を公式確認済みにはしません。

## リンクとアイコン

`profileLinks` に登録したHTTPS URLだけ表示します。旧データのYouTube・X・Wikiにも対応します。
6種類の公式アイコンは提供された `https://www.nijisanji.jp/icon/` 配下を参照し、
取得できない場合は汎用アイコンと名称を表示します。Wikiには本のアイコンを使います。
外部画像は遅延読込し、リファラーを送信しません。
この実装では画像ファイル自体の再配布を行いません。

公式URLで公開されていることは再配布許諾の確認にはなりません。
ANYCOLOR二次創作ガイドライン https://www.anycolor.co.jp/guidelines/ は
そのままのコピーを二次創作の対象外としています。ローカル同梱する場合は権利条件を別途確認してください。
直リンクも権利許諾を保証するものではなく、配信元変更時にはアイコン定義を更新してください。
サイトの既存の非公式表示を維持しています。
