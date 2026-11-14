import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const sourceFile = 'public/data/portrait-sources.json';
const liverDir = 'public/data/livers';
const portraits = JSON.parse(fs.readFileSync(sourceFile, 'utf8')).portraits;
const livers = fs.readdirSync(liverDir)
  .filter(name => name.endsWith('.json') && !name.startsWith('demo_'))
  .map(name => JSON.parse(fs.readFileSync(path.join(liverDir, name), 'utf8')));
const byId = new Map(livers.map(x => [x.id, x]));

test('公式画像登録一覧は29人分ありIDが重複しない', () => {
  assert.equal(portraits.length, 29);
  assert.equal(new Set(portraits.map(x => x.id)).size, portraits.length);
});

test('公式画像データのライバーID・名前・プロフィールURLが一致', () => {
  for (const entry of portraits) {
    const liver = byId.get(entry.id);
    assert.ok(liver, `Missing liver: ${entry.name} / ${entry.id}`);
    assert.equal(entry.name, liver.name);
    assert.equal(entry.sourceUrl, liver.officialProfileUrl);
  }
});

test('画像URLは公式プロフィールから抽出した画像配信元を使う', () => {
  for (const entry of portraits) {
    const src = new URL(entry.imageUrl);
    const source = new URL(entry.sourceUrl);
    assert.equal(src.hostname, 'images.microcms-assets.io');
    assert.equal(source.hostname, 'www.nijisanji.jp');
    assert.ok(source.pathname.startsWith('/talents/l/'));
  }
});
