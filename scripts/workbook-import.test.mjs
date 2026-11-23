import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('workbook import matches URL and name, preserves blank fields and activity, and supports new fields',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'niji-workbook-test-'));
 try{
  const liver=JSON.parse(fs.readFileSync('public/data/livers/TMP_elu.json','utf8'));
  liver.imageColor='#123456';
  fs.mkdirSync(path.join(dir,'public/data/livers'),{recursive:true});
  const file=path.join(dir,'public/data/livers',liver.id+'.json');
  fs.writeFileSync(file,JSON.stringify(liver));
  const header=['ライバー名（変更しない）','公式プロフィールURL（変更しない）','名前のよみ（ひらがな）','ローマ字表記','イメージカラー','同期ユニット','各種リンク（TikTok）'];
  const data={schemaVersion:1,sheets:{'代表画像・プロフィール':[header,[liver.name,liver.officialProfileUrl,'てすと','Test',null,'テスト同期','https://www.tiktok.com/@test']],...Object.fromEntries(['衣装・ビジュアル','衣装差分','楽曲','活動履歴'].map(s=>[s,[['ライバー名']]])),'ハッシュタグ':[['氏名（ライバー名）','公式プロフィールURL','タグ種別','タグ（#を含む）'],[liver.name,liver.officialProfileUrl,'配信','#テスト']]}};
  const input=path.join(dir,'input.json');fs.writeFileSync(input,JSON.stringify(data));
  const run=()=>spawnSync(process.execPath,[path.resolve('scripts/import-manual-livers.mjs'),input,'--apply','--overwrite-existing'],{cwd:dir,encoding:'utf8'});
  let result=run();assert.equal(result.status,0,result.stderr);
  const updated=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(updated.reading,'てすと');assert.equal(updated.englishName,'Test');assert.equal(updated.imageColor,'#123456');assert.equal(updated.syncUnit,'テスト同期');assert.equal(updated.profileLinks.tiktok,'https://www.tiktok.com/@test');assert.equal(updated.hashtags.at(-1).tag,'#テスト');
  for(const key of ['id','officialProfileUrl','visuals','music','events','youtube','changes'])assert.deepEqual(updated[key],liver[key]);
  data.sheets['代表画像・プロフィール'][1][0]='別の人';fs.writeFileSync(input,JSON.stringify(data));
  const before=fs.readFileSync(file,'utf8');result=run();assert.notEqual(result.status,0);assert.equal(fs.readFileSync(file,'utf8'),before);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
