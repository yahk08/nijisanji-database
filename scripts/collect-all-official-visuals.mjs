/**
 * Official NIJISANJI profile image discovery/import (non-destructive).
 * Usage: node scripts/collect-all-official-visuals.mjs
 *        node scripts/collect-all-official-visuals.mjs --apply
 *        node scripts/collect-all-official-visuals.mjs --apply --cache-only
 *
 * All discoveries are NOT presumed initial outfits; no original images, visuals,
 * portrait URLs, titles, dates, or other fields are overwritten.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const liverDir = path.join(ROOT, 'public/data/livers');
const reportFile = path.join(ROOT, 'public/data/official-visual-discovery-report.json');
const cacheDir = path.join(ROOT, '.outfit-page-cache');
const apply = process.argv.includes('--apply');
const cacheOnly = process.argv.includes('--cache-only');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const official = /^https:\/\/www\.nijisanji\.jp\/talents\/l\/[a-z0-9-]+\/?$/;
const imageHost = 'images.microcms-assets.io';

export function normalizedUrl(raw) {
  if (typeof raw !== 'string') return null;
  try {const u = new URL(raw.replaceAll('\\/','/').replaceAll('&amp;','&'));
    if (u.protocol !== 'https:' || u.hostname !== imageHost || !u.pathname.startsWith('/assets/')) return null;
    u.search = '';u.hash = '';return u.toString();
  } catch {return null;}
}
function flatten(value,out=[],depth=0) {
  if (depth>22 || value===null || value===undefined) return out;
  if (typeof value==='string') { if(value.includes(imageHost)) out.push(value);return out; }
  if(Array.isArray(value)){for(const v of value)flatten(v,out,depth+1);return out;}
  if(typeof value==='object') for(const v of Object.values(value)) flatten(v,out,depth+1);
  return out;
}
export function collectOfficialAssets(html) {
  const values=[];
  // Next.js embedded JSON (including images outside liverDetail).
  const next=html.match(/<script\s+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if(next) try{flatten(JSON.parse(next[1]),values);}catch{}
  // HTML image tags / serialized attributes, in case the server page moves fields.
  const raw=html.replaceAll('\\u0026','&').replaceAll('\\/','/').replaceAll('&amp;','&');
  for(const m of raw.matchAll(/https:\/\/images\.microcms-assets\.io\/assets\/[A-Za-z0-9_./%+-]+(?:\?[^\s"'<>\\]*)?/g)) values.push(m[0]);
  return [...new Set(values.map(normalizedUrl).filter(Boolean))];
}
function fileDescriptor(url){
  let filename;
  try{filename=decodeURIComponent(new URL(url).pathname.split('/').pop()||'');}catch{return null;}
  const match=filename.match(/^liver[-_]((?:full[-_]?body)|face|head)[-_](.+?)\.(?:png|jpe?g|webp)(?:\.webp)?$/i);
  if(!match)return null;
  const base=match[2].replace(/_costume\d+$/i,'').replace(/_3d\d*$/i,'');
  const costume=(match[2].match(/_costume\d+$/i)||[])[0]||'';
  return {type:/full/i.test(match[1])?'full':'face', base:base.toLowerCase(), key:match[2].toLowerCase(), costume, filename};
}
function identityBases(liver,review){
  const out=new Set();
  for(const url of [liver.portraitUrl,...(liver.visuals||[]).flatMap(v=>[v.imageUrl,...(v.variants||[]).map(x=>x.imageUrl)]),...(review?.candidates||[]).map(x=>x.imageUrl)]){
    const desc=fileDescriptor(url||'');if(desc)out.add(desc.base);
  }
  return out;
}
export function candidatesForLiver(urls,identity){
  const groups=new Map();
  for(const url of urls){const d=fileDescriptor(url);if(!d||!identity.has(d.base))continue;
    const group=groups.get(d.key)||{key:d.key,full:null,face:null,source:'official-profile'};
    if(!group[d.type])group[d.type]=url;groups.set(d.key,group);
  }
  return [...groups.values()].filter(x=>x.full).sort((a,b)=>a.key.localeCompare(b.key));
}
function isSameVisual(visual,url){
  const target=normalizedUrl(url);return [visual.imageUrl,...(visual.variants||[]).map(x=>x.imageUrl)].some(v=>normalizedUrl(v)===target);
}
function imageId(key){return 'official-discovery-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12);}
function writeAtomic(filename,obj){const tmp=filename+'.tmp';fs.writeFileSync(tmp,JSON.stringify(obj,null,2)+'\n');fs.renameSync(tmp,filename);}
async function pageFor(liver){
  const target=liver.officialProfileUrl;const cache=path.join(cacheDir,crypto.createHash('sha256').update(target).digest('hex')+'.html');
  if(fs.existsSync(cache))return fs.readFileSync(cache,'utf8');
  if(cacheOnly)throw new Error('キャッシュなし');
  await pause(1300);
  const res=await fetch(target,{headers:{'User-Agent':'NijiDBPersonalProject/1.0 (official-profile-review)'},signal:AbortSignal.timeout(25000)});
  if(res.status===403||res.status===429)throw new Error('RATE_LIMIT '+res.status);
  if(!res.ok)throw new Error('HTTP '+res.status);
  const html=await res.text();
  // Ensure response is a profile page, not an HTML error or challenge.
  if(!html.includes('__NEXT_DATA__')&&!html.includes('GALLERY'))throw new Error('公式ページ形式が未対応');
  fs.mkdirSync(cacheDir,{recursive:true});fs.writeFileSync(cache,html);return html;
}

async function main(){
  if(!fs.existsSync(liverDir))throw new Error('nijisanji-databaseフォルダーで実行してください');
  const files=fs.readdirSync(liverDir).filter(f=>f.endsWith('.json')&&!f.startsWith('demo_')).sort();
  const reviewFile=path.join(ROOT,'public/data/initial-outfit-review.json');
  const review=fs.existsSync(reviewFile)?JSON.parse(fs.readFileSync(reviewFile,'utf8')):null;
  const byId=new Map((review?.livers||[]).map(x=>[x.id,x]));
  const report={schemaVersion:1,description:'公式プロフィールの全身画像の探索結果。初期衣装・新衣装・公開日を自動確定しない。',mode:apply?'apply':'preview',checkedAt:new Date().toISOString(),totalLivers:files.length,scanned:0,withNewImages:0,newVisuals:0,alreadyKnown:0,noNewImages:[],errors:[],livers:[]};
  let blocked=false;
  for(const file of files){
    const filePath=path.join(liverDir,file);const liver=JSON.parse(fs.readFileSync(filePath,'utf8'));
    const row={id:liver.id,name:liver.name,officialProfileUrl:liver.officialProfileUrl,found:0,added:0,status:'not-checked'};
    report.livers.push(row);
    if(blocked){row.status='skipped-after-rate-limit';continue;}
    if(!official.test(liver.officialProfileUrl||'')){row.status='invalid-profile';report.errors.push(`${liver.name}: 公式URL不正`);continue;}
    if(!Array.isArray(liver.visuals)){row.status='invalid-visuals';report.errors.push(`${liver.name}: visualsなし`);continue;}
    try{
      const html=await pageFor(liver);
      const ids=identityBases(liver,byId.get(liver.id));
      const allUrls=collectOfficialAssets(html);
      const groups=candidatesForLiver(allUrls,ids);
      row.found=groups.length;
      row.status='ok';report.scanned++;
      for(const group of groups){
        const already=liver.visuals.some(v=>isSameVisual(v,group.full));
        if(already){report.alreadyKnown++;continue;}
        const id=imageId(group.full);
        const item={id,title:'公式掲載衣装候補（追加収集）',category:'2D',kind:'衣装候補（初期衣装・新衣装・公開日未確認）',date:null,imageUrl:group.full,revealUrl:null,variants:[{id:id+'-full',name:'全身',date:null,imageUrl:group.full},...(group.face?[{id:id+'-face',name:'顔アップ',date:null,imageUrl:group.face}]:[])],sources:[{label:'にじさんじ公式プロフィール',url:liver.officialProfileUrl,verifiedAt:report.checkedAt}],verification:'candidate',sourcePath:'official-profile-page'};
        liver.visuals.push(item);row.added++;report.newVisuals++;
      }
      if(row.added){report.withNewImages++;if(apply)writeAtomic(filePath,liver);}else report.noNewImages.push(liver.id);
    }catch(e){row.status='error';const message=String(e.message||e);report.errors.push(`${liver.name}: ${message}`);if(message.startsWith('RATE_LIMIT'))blocked=true;}
    if(report.livers.length%10===0){console.log(`${report.livers.length}/${files.length}人 / 新規衣装候補 ${report.newVisuals}組`);}
  }
  writeAtomic(reportFile,report);
  console.log(`調査 ${report.scanned}/${report.totalLivers}人 / 追加${apply?'済み':'候補'} ${report.newVisuals}組 / 対象 ${report.withNewImages}人 / エラー ${report.errors.length}件`);
  console.log('確認レポート: public/data/official-visual-discovery-report.json');
  console.log('※公式のデフォルト表示は初期衣装を意味しません。初期衣装の判定は別途必要です。');
  if(!apply)console.log('保存するには --apply を指定して再実行してください（キャッシュを再利用）。');
  if(report.errors.length)console.log('エラー内容はレポートを確認してください。');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e);process.exitCode=1});
