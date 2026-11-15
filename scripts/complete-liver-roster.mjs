/**
 * Completes registered NIJISANJI (including former ID/KR) and NIJISANJI EN.
 * Preview: node scripts/complete-liver-roster.mjs
 * Write:   node scripts/complete-liver-roster.mjs --apply
 * Existing liver JSON is NEVER overwritten; existing IDs and curated data stay intact.
 * Does not use YouTube API or its quota.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = process.cwd();
const dir = path.join(root,'public/data/livers');
const rosterFile = path.join(root,'public/data/roster-candidates.json');
const reportFile = path.join(root,'public/data/roster-completion-report.json');
const apply = process.argv.includes('--apply');
const listURLs = {
  JP: 'https://www.nijisanji.jp/talents?filter=nijisanji',
  EN: 'https://www.nijisanji.jp/talents?filter=nijisanji_en',
};
const cacheDir=path.join(root,'.roster-completion-cache');
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const normalize=(s)=>String(s||'').normalize('NFKC').trim();
const dateNow=new Date().toISOString();
const empty=()=>({value:null,sources:[],showSources:false,verification:'unknown'});

// The official site is a Next.js app today, but fail closed if its format changes.
export function pageProps(html) {
  const m=html.match(/<script\s+[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if(!m)throw Error('公式ページの形式を解釈できません（__NEXT_DATA__なし）');
  const data=JSON.parse(m[1]);
  if(!data?.props?.pageProps)throw Error('公式ページの必要データがありません');
  return data.props.pageProps;
}
export function groupedListing(props, group) {
  if(!Array.isArray(props.allLivers))throw Error('公式一覧 allLivers がありません');
  const items=props.allLivers.filter(x=>{
    const affiliation=x?.profile?.affiliation;
    const text=Array.isArray(affiliation)?affiliation.join(' '):String(affiliation||'');
    return group==='EN'? /NIJISANJI\s*EN/i.test(text) : text.includes('にじさんじ') && !/NIJISANJI\s*EN/i.test(text);
  });
  const entries=[]; const slugs=new Set();
  for(const x of items){
    const slug=x.slug;
    if(typeof slug!=='string'||!/^[a-z0-9-]+$/.test(slug)||slugs.has(slug)||!normalize(x.name))throw Error('公式一覧のslug・名前が不正または重複しています');
    slugs.add(slug);
    entries.push({slug,name:x.name,group});
  }
  return entries;
}
const mkSource=(url)=>({label:'にじさんじ公式プロフィール',url,kind:'official',verifiedAt:dateNow});
export function skeleton(d,group,url,day=dateNow){
  if(!d||typeof d.id!=='string'&&!Number.isInteger(d.id))throw Error('公式プロフィールID不正');
  if(!normalize(d.name))throw Error('公式プロフィール名前なし');
  const id='TMP_'+new URL(url).pathname.split('/').pop().replaceAll('-','_');
  if(!/^TMP_[A-Za-z0-9_-]+$/.test(id))throw Error('公式IDの形式不正');
  const date=(v)=>{if(!v)return null;const d=new Date(v);return Number.isNaN(d.getTime())?null:new Date(d.getTime()+9*3600000).toISOString().slice(0,10)};
  const debut=date(d.profile?.debutAt);
  const src={label:'にじさんじ公式プロフィール',url,kind:'official',verifiedAt:day};
  const fv=v=>({value:v,verification:'official',sources:[src],showSources:true});
  let birthday=null;
  const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
  for(const item of d.profile?.profileItems||[]){
    if(!/^(誕生日|생일|Ulang Tahun|Birthday)$/i.test(item.name||''))continue;
    const raw=String(item.value||'');
    const jp=raw.match(/^(\d{1,2})[月월]\s*(\d{1,2})[日일]/);
    const en=raw.match(/^(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)$/i);
    const mm=jp?Number(jp[1]):en?months.indexOf(en[2].toLowerCase())+1:null;
    const dd=jp?Number(jp[2]):en?Number(en[1]):null;
    if(mm>=1&&mm<=12&&dd>=1&&dd<=31)birthday=String(mm).padStart(2,'0')+'-'+String(dd).padStart(2,'0');
  }
  const l={id,status:'active',name:d.name,reading:d.ruby||null,englishName:d.enName||null,affiliation:group==='EN'?'NIJISANJI EN':'にじさんじ',group:null,branch:group,officialProfileUrl:url,portraitUrl:null,youtubeChannelUrl:d.socialLinks?.youtube||null,youtubeChannelId:d.channelId||null,xUrl:d.socialLinks?.twitter||null,birthday:birthday?fv(birthday):empty(),debutDate:debut?fv(debut):empty(),height:empty(),fanMark:empty(),introduction:empty(),fields:[],changes:[],visuals:[],music:[],events:[],youtube:{fetchedAt:null,stateCheckedAt:null,videos:[]},provenance:{checkedAt:day,links:{verification:'official-linked',note:'公式個別プロフィール掲載のURL。YouTube API・X APIのアカウント照合は未実施'},wiki:{url:'https://wikiwiki.jp/nijisanji/'+encodeURIComponent(d.name),status:'unavailable'}}};
  return l;
}

async function fetchPage(url){
  fs.mkdirSync(cacheDir,{recursive:true});
  const name=crypto.createHash('sha256').update(url).digest('hex')+'.html';
  const dest=path.join(cacheDir,name);
  if(fs.existsSync(dest))return fs.readFileSync(dest,'utf8');
  await sleep(1250);
  const res=await fetch(url,{signal:AbortSignal.timeout(25000),headers:{'User-Agent':'NijiDatabasePersonalProject/1.0 (official roster audit)'}});
  if(res.status===403||res.status===429)throw Error('公式サイトからアクセス制限（'+res.status+'）。時間を空けて再試行してください');
  if(!res.ok)throw Error(`公式ページ取得エラー HTTP ${res.status}`);
  const html=await res.text();
  fs.writeFileSync(dest,html);
  return html;
}
async function main(){
  if(!fs.existsSync(dir)||!fs.existsSync(rosterFile))throw Error('nijisanji-database フォルダーのルートで実行してください');
  const existingFiles=fs.readdirSync(dir).filter(f=>f.endsWith('.json')&&!f.startsWith('demo_'));
  const existing=existingFiles.map(f=>({file:f,liver:JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'))}));
  const byUrl=new Map(),byName=new Map(),ids=new Set();
  for(const {file,liver} of existing){
    if(file!==liver.id+'.json'||ids.has(liver.id))throw Error('既存のJSONファイル名とIDが不一致または重複しています');
    ids.add(liver.id);
    if(byUrl.has(liver.officialProfileUrl)||byName.has(normalize(liver.name)))throw Error('既存の公式URLまたは名前が重複: '+liver.name);
    byUrl.set(liver.officialProfileUrl,liver);byName.set(normalize(liver.name),liver);
  }
  const roster=JSON.parse(fs.readFileSync(rosterFile,'utf8'));
  if(!Array.isArray(roster.candidates))throw Error('roster-candidates.json の配列が不正です');
  const official={};
  for(const [group,url] of Object.entries(listURLs)){
    const props=pageProps(await fetchPage(url));
    official[group]=groupedListing(props,group);
    if(group==='JP'&&(official[group].length<150||official[group].length>230))throw Error(`JP公式一覧件数が想定外: ${official[group].length}人（サイト変更の可能性）`);
    if(group==='EN'&&(official[group].length<20||official[group].length>70))throw Error(`EN公式一覧件数が想定外: ${official[group].length}人（サイト変更の可能性）`);
    console.log(`公式${group}一覧: ${official[group].length}人`);
  }
  const all=[...official.JP,...official.EN];
  const officialUrls=new Set(all.map(x=>'https://www.nijisanji.jp/talents/l/'+x.slug));
  const errors=[];const additions=[];const already=[];
  for(const entry of all){
    const url='https://www.nijisanji.jp/talents/l/'+entry.slug;
    const old=byUrl.get(url)||byName.get(normalize(entry.name));
    if(old){
      if(old.officialProfileUrl!==url||normalize(old.name)!==normalize(entry.name))errors.push(`要確認（既存データと公式一覧の不一致）: ${entry.name} / ${old.id}`);
      else already.push({id:old.id,name:old.name,group:entry.group});
      continue;
    }
    // Verify individual profile before accepting a person or profile URL.
    try{
      const d=pageProps(await fetchPage(url)).liverDetail;
      if(!d||d.hidden||d.unit||d.slug!==entry.slug||normalize(d.name)!==normalize(entry.name))throw Error('個別ページの名前・slug・表示状態が一致しません');
      const liver=skeleton(d,entry.group,url);
      if(ids.has(liver.id))throw Error('既存IDと衝突: '+liver.id);
      if(additions.some(x=>x.liver.id===liver.id||x.liver.officialProfileUrl===url))throw Error('追加候補のID・URL重複');
      ids.add(liver.id);
      additions.push({liver,file:liver.id+'.json',sourceGroup:entry.group});
      console.log(`新規候補 ${entry.group}: ${entry.name}`);
    }catch(e){errors.push(`${entry.name}: ${e.message}`); if(/アクセス制限/.test(e.message))break;}
  }
  for(const {liver} of existing){
    if(!officialUrls.has(liver.officialProfileUrl))errors.push(`既存ライバーが公式現役一覧に見つかりません（卒業・改名等の確認が必要）: ${liver.name}`);
  }
  const duplicate=new Set(roster.candidates.map(x=>normalize(x.name)));
  for(const {liver} of additions){if(duplicate.has(normalize(liver.name)))errors.push(`roster-candidates.json に同名の未照合候補があります: ${liver.name}`);duplicate.add(normalize(liver.name));}
  const report={checkedAt:dateNow,mode:apply?'apply':'preview',jpCount:official.JP.length,enCount:official.EN.length,existingCount:existing.length,alreadyMatched:already.length,proposedAdditions:additions.map(({liver,sourceGroup})=>({id:liver.id,name:liver.name,branch:sourceGroup,url:liver.officialProfileUrl})),errors,notes:['JPは旧ID・旧KR統合先を含む公式区分。旧所属の出自を新しく推測・書換しません。','現役の個別プロフィールURLとIDが検証できた対象のみ作成。卒業・改名に関わるデータは自動変更しません。','公式サイトや通信に問題がある場合、既存JSONとroster-candidatesは変更しません。']};
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
  console.log(`既存 ${existing.length}人 / 追加候補 ${additions.length}人 / 要確認 ${errors.length}件`);
  if(errors.length){console.error(errors.slice(0,15).join('\n'));throw Error('要確認があるため安全のため登録中止。レポートを確認してください。');}
  if(!apply){console.log('調査のみ完了。既存データは変更していません。保存するには --apply を指定してください。');return;}
  const updated=structuredClone(roster);
  for(const {liver} of additions)updated.candidates.push({name:liver.name,status:'verified',liverId:liver.id,officialProfileUrl:liver.officialProfileUrl,verifiedAt:dateNow});
  // Existing entries must already have been marked as verified by the prior build:index process.
  // Synchronize ONLY entries whose official URL and name match an existing liver.
  for(const {liver} of existing){
    const c=updated.candidates.find(x=>normalize(x.name)===normalize(liver.name));
    if(!c)throw Error('既存ライバーがroster候補一覧にありません: '+liver.name);
    if(c.officialProfileUrl&&c.officialProfileUrl!==liver.officialProfileUrl)throw Error('rosterの公式URL不一致: '+liver.name);
    if(c.liverId&&c.liverId!==liver.id)throw Error('rosterのID不一致: '+liver.name);
    c.status='verified';c.liverId=liver.id;c.officialProfileUrl=liver.officialProfileUrl;
  }
  // Stage candidate files first, create new ones only. Existing ones never overwritten.
  for(const {liver,file} of additions){const dest=path.join(dir,file);fs.writeFileSync(dest,JSON.stringify(liver,null,2)+'\n',{flag:'wx'});}
  fs.writeFileSync(rosterFile,JSON.stringify(updated,null,2)+'\n');
  report.applied=additions.length;
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
  console.log(`追加完了: ${additions.length}人。続けて npm.cmd run build:index と npm.cmd run validate:roster を実行してください。`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){await main().catch(e=>{console.error(e.message);process.exitCode=1});}
