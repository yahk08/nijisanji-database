import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync(new URL('./collect-outfit-candidates.mjs', import.meta.url),'utf8');
test('画像候補収集は公開中のプロフィールや公開画像設定を自動上書きしない',()=>{
 assert.match(src,/initial-outfit-review\.json/);
 assert.doesNotMatch(src,/writeFileSync\(['"]public\/data\/livers/);
 assert.doesNotMatch(src,/writeFileSync\(['"]public\/data\/portrait-sources/);
});
test('初期衣装と断定する前に手動確認を必要とする',()=>{
 assert.match(src,/needs-manual-outfit-verification/);
 assert.match(src,/初期衣装確定を意味しません/);
});
test('アクセス制限時に追加アクセスを止める',()=>{
 assert.match(src,/blocked = true/);
 assert.match(src,/if \(blocked\)/);
});
