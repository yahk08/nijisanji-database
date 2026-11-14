/**
 * 追加の初期衣装画像を既存ギャラリーを保ったまま取り込む。
 * Preview: node scripts/import-verified-initial-visuals.mjs
 * Apply:   node scripts/import-verified-initial-visuals.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';

const apply = process.argv.includes('--apply');
const dir = 'public/data/livers';
const manifestFile = 'public/data/verified-initial-visuals.json';
const reportFile = 'public/data/initial-visual-coverage-report.json';
function fail(message) {throw new Error(`初期衣装取り込み: ${message}`)}
function read(file) {return JSON.parse(fs.readFileSync(file, 'utf8'))}
function normalize(url) { try {const u = new URL(url); u.search=''; return u.toString()} catch {return ''} }
function makeVisual(v) {
  return {
    id: v.visualId, title: v.title, category: v.category, kind:v.kind, date:v.date || null,
    imageUrl:v.imageUrl, revealUrl:v.revealUrl || null,
    variants:[{id:`${v.visualId}-full`, name:'全身', date:v.date || null, imageUrl:v.imageUrl}],
    sources: v.sources,
    verification:'manually-reviewed',
    note:'公式画像URLと非公式衣装一覧を照合。掲載許諾を意味しません。'
  };
}
if (!fs.existsSync(manifestFile)) fail(`${manifestFile} が見つかりません`);
const manifest=read(manifestFile);
if(manifest.schemaVersion!==1||!Array.isArray(manifest.entries))fail('照合ファイル形式が不正です');
if(!fs.existsSync(dir))fail(`${dir} が見つかりません`);
const liverFiles=fs.readdirSync(dir).filter(f=>f.endsWith('.json')&&!f.startsWith('demo_'));
const byId=new Map();
for (const file of liverFiles) {const liver=read(path.join(dir,file));if(file!==`${liver.id}.json`||byId.has(liver.id))fail(`ID/ファイルの不整合: ${file}`);byId.set(liver.id,{file,liver});}
const seenIds=new Set(),seenVisualIds=new Set(),pending=[];
let skipped=0;
for (const v of manifest.entries) {
  if(!v.liverId||seenIds.has(v.liverId))fail(`重複したライバーの初期衣装登録: ${v.liverId}`);
  seenIds.add(v.liverId);
  if(!v.visualId||seenVisualIds.has(v.visualId))fail(`衣装IDが空欄または重複: ${v.visualId}`);
  seenVisualIds.add(v.visualId);
  const target=byId.get(v.liverId);
  if(!target)fail(`ライバーが未登録: ${v.liverId}`);
  const {file,liver}=target;
  if(liver.name!==v.liverName||liver.officialProfileUrl!==v.officialProfileUrl)fail(`照合先の名前または公式URL不一致: ${v.liverName}`);
  if(!Array.isArray(liver.visuals))fail(`visuals配列なし: ${v.liverName}`);
  if(v.category!=='2D'&&v.category!=='3D')fail(`カテゴリ不正: ${v.liverName}`);
  if(v.kind!=='初期衣装')fail(`初期衣装以外の登録: ${v.liverName}`);
  if(!/^https:\/\/images\.microcms-assets\.io\/assets\//.test(v.imageUrl))fail(`公式CDN以外の画像: ${v.liverName}`);
  if(v.date && !/^\d{4}-\d{2}-\d{2}$/.test(v.date))fail(`日付形式不正: ${v.liverName}`);
  if(!Array.isArray(v.sources)||v.sources.length<2)fail(`出典不足: ${v.liverName}`);
  const sameId=liver.visuals.find(x=>x.id===v.visualId);
  if(sameId) { if(normalize(sameId.imageUrl)!==normalize(v.imageUrl))fail(`衣装ID衝突: ${v.liverName}`);skipped++;continue; }
  if(liver.visuals.some(x=>normalize(x.imageUrl)===normalize(v.imageUrl))) {skipped++;continue;}
  // Only append, never change existing outfit data or portrait settings.
  liver.visuals.push(makeVisual(v));
  pending.push({file,liver});
}
const coverage={schemaVersion:1, totalLivers:byId.size, verifiedInitialInManifest:manifest.entries.length, additions:pending.length, alreadyPresent:skipped, notYetManuallyVerified: [...byId.values()].filter(({liver})=>!manifest.entries.some(v=>v.liverId===liver.id)).map(({liver})=>({id:liver.id,name:liver.name,officialProfileUrl:liver.officialProfileUrl})), notice:'未掲載のライバーは未検証。全員に初期衣装がないことを意味しません。'};
if(apply){
  for(const {file,liver} of pending){const dest=path.join(dir,file);const temp=dest+'.tmp';fs.writeFileSync(temp,JSON.stringify(liver,null,2)+'\n');fs.renameSync(temp,dest);}
  fs.writeFileSync(reportFile,JSON.stringify(coverage,null,2)+'\n');
}
console.log(`${apply?'登録':'登録予定'}: ${pending.length}着 / 重複回避: ${skipped}着 / 登録済みライバー: ${byId.size}人`);
console.log(`初期衣装の照合未完了: ${coverage.notYetManuallyVerified.length}人（欠損確定ではありません）`);
console.log(apply?`追加完了。${reportFile} を作成しました。`:'確認のみ。変更する場合は --apply を付けて再実行してください。');
