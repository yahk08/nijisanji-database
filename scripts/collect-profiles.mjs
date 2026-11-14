import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const cache = process.env.PROFILE_CACHE || '../profile-cache';
fs.mkdirSync(cache,{recursive:true});
const stamp=new Date().toISOString(), day=stamp.slice(0,10);
const listUrl='https://www.nijisanji.jp/talents?filter=nijisanji';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const blockedHosts=new Set();
async function get(url){
  const file=path.join(cache,crypto.createHash('sha256').update(url).digest('hex')+'.html');
  if(fs.existsSync(file))return fs.readFileSync(file,'utf8');
  const host=new URL(url).host;
  if(blockedHosts.has(host))throw Error('この実行ではアクセス制限により取得停止');
  if(process.env.PROFILE_CACHE_ONLY==='1')throw Error('キャッシュ未収録（追加通信なし）');
  await sleep(host==='wikiwiki.jp'?3000:700);
  const r=await fetch(url,{signal:AbortSignal.timeout(30000)});
  if(r.status===429||r.status===403)blockedHosts.add(host);
  if(!r.ok)throw Error(`HTTP ${r.status}`);
  const html=await r.text();fs.writeFileSync(file,html);return html;
}
function next(html){const m=html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);if(!m)throw Error('公開ページ構造変更');return JSON.parse(m[1]).props.pageProps;}
const clean=s=>s.replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).trim();
const src=(url,kind='official')=>({label:kind==='official'?'にじさんじ公式プロフィール':'にじさんじ非公式Wiki（一次資料未確認）',url,kind,verifiedAt:stamp});
const value=(v,url,kind='official')=>({value:v,verification:kind==='official'?'official':'wiki-only',sources:[src(url,kind)],showSources:true});
const empty=()=>({value:null,verification:'unknown'});
const dir='public/data/livers';
const existing=fs.readdirSync(dir).filter(f=>f.endsWith('.json')&&!f.startsWith('demo_')).map(f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8')));
const roster=next(await get(listUrl)).allLivers.filter(x=>x.profile.affiliation.includes('にじさんじ'));
if(roster.length<100||new Set(roster.map(x=>x.slug)).size!==roster.length)throw Error('公式一覧の件数・重複を確認してください');
const report={checkedAt:stamp,scope:'にじさんじ（指定filter。EN/VirtuaReal除外）',listUrl,officialCount:roster.length,profiles:[],failures:[],notInOfficialList:existing.filter(x=>!roster.some(r=>r.name===x.name||x.officialProfileUrl.endsWith('/'+r.slug))).map(x=>({id:x.id,name:x.name}))};
for(const [i,r] of roster.entries()){
  const url='https://www.nijisanji.jp/talents/l/'+r.slug;
  try{
    const d=next(await get(url)).liverDetail;
    if(d.slug!==r.slug||d.hidden||d.unit)throw Error('個人プロフィール照合不一致');
    const matches=existing.filter(x=>x.officialProfileUrl===url||x.name===d.name);
    if(matches.length>1)throw Error('既存ID複数一致');
    const l=matches[0]||{id:'niji_'+d.id,status:'active',name:d.name,reading:null,englishName:null,affiliation:'にじさんじ',group:null,branch:'JP',officialProfileUrl:url,portraitUrl:null,youtubeChannelUrl:null,youtubeChannelId:null,xUrl:null,birthday:empty(),debutDate:empty(),height:empty(),fanMark:empty(),introduction:empty(),fields:[],changes:[],visuals:[],music:[],events:[],youtube:{fetchedAt:null,stateCheckedAt:null,videos:[]}};
    const change=(key,newValue)=>{
      const oldValue=l[key];
      const before=oldValue&&typeof oldValue==='object'&&'value'in oldValue?oldValue.value:oldValue;
      const after=newValue&&typeof newValue==='object'&&'value'in newValue?newValue.value:newValue;
      if(JSON.stringify(before)!==JSON.stringify(after))l.changes.push({id:crypto.createHash('sha256').update(l.id+key+stamp+JSON.stringify(after)).digest('hex').slice(0,20),field:key,oldValue:before==null?null:String(before),newValue:after==null?null:String(after),changedAt:stamp,sources:[src(url)]});
      l[key]=newValue;
    };
    for(const [key,v]of Object.entries({status:'active',name:d.name,reading:d.ruby||null,englishName:d.enName||null,officialProfileUrl:url,youtubeChannelId:d.channelId||null,youtubeChannelUrl:d.socialLinks?.youtube||null,xUrl:d.socialLinks?.twitter||null}))change(key,v);
    const debut=d.profile.debutAt?new Date(new Date(d.profile.debutAt).getTime()+9*3600000).toISOString().slice(0,10):null;
    if(debut)change('debutDate',{...value(debut,url),note:'公式サイトのデビュー日。初配信日とは異なる場合があります。'});
    for(const f of d.profile.profileItems||[]){
      if(['誕生日','생일','Ulang Tahun','Birthday'].includes(f.name)){
        const b=f.value.match(/(\d{1,2})[月월]\s*(\d{1,2})[日일]/);
        const en=f.value.match(/^(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December)$/i);
        const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
        const birthday=b?b[1].padStart(2,'0')+'-'+b[2].padStart(2,'0'):en?String(months.indexOf(en[2].toLowerCase())+1).padStart(2,'0')+'-'+en[1].padStart(2,'0'):f.value;
        change('birthday',value(birthday,url));
      }else{
        let group=l.fields.find(g=>g.section==='公式プロフィール');if(!group){group={section:'公式プロフィール',items:[]};l.fields.push(group);}
        const item=group.items.find(x=>x.label===f.name);if(item)item.data=value(f.value,url);else group.items.push({label:f.name,data:value(f.value,url)});
      }
    }
    for(const key of ['birthday','debutDate','height','fanMark','introduction'])if(!l[key].verification)l[key].verification=l[key].value?'legacy-unreviewed':'unknown';
    l.provenance={officialId:d.id,checkedAt:stamp,membership:{verification:'official',sources:[{...src(listUrl),label:'にじさんじ公式タレント一覧'}]},links:{verification:'official-linked',sources:[src(url)],note:'公式プロフィール掲載先との照合。YouTube APIおよびX APIによるアカウント照会は未実行。'}};
    const wikiUrl='https://wikiwiki.jp/nijisanji/'+encodeURIComponent(d.name);
    let wiki={url:wikiUrl,status:'unavailable'};
    try{
      const html=await get(wikiUrl);
      if(!html.includes(d.name)||!html.includes('<table'))throw Error('Wikiプロフィール未検出');
      wiki={url:wikiUrl,status:'read',checkedAt:stamp,youtubeChannelLinked:!!d.channelId&&html.includes(d.channelId),xAccountLinked:!!d.socialLinks?.twitter&&html.toLowerCase().includes(d.socialLinks.twitter.split('/').pop().toLowerCase())};
      for(const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)){
        const cells=[...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)].map(x=>clean(x[1]));
        if(cells.length<2)continue;
        const key=cells[0]==='身長'?'height':/^(ファンマーク|推しマーク)$/.test(cells[0])?'fanMark':null;
        if(!key||l[key].value)continue;
        const v=key==='height'?cells[1].match(/^\d{2,3}(?:\.\d+)?\s*cm$/i)?.[0]:cells[1].length<30?cells[1]:null;
        if(v){change(key,value(v,wikiUrl,'wiki'));l.changes.at(-1).sources=[src(wikiUrl,'wiki')];}
      }
      if(!l.fanMark.value){
        const text=clean(html);
        const matches=[...text.matchAll(/ファンマーク[：:]\s*([\p{Extended_Pictographic}\uFE0F\u200D★]+)/gu)];
        const marks=[...new Set(matches.map(m=>m[1]))];
        if(marks.length===1){change('fanMark',value(marks[0],wikiUrl,'wiki'));l.changes.at(-1).sources=[src(wikiUrl,'wiki')];}
      }
    }catch(e){wiki.error=e.message;}
    l.provenance.wiki=wiki;
    fs.writeFileSync(path.join(dir,l.id+'.json'),JSON.stringify(l,null,2)+'\n');
    report.profiles.push({id:l.id,name:l.name,officialUrl:url,wiki,...Object.fromEntries(['birthday','debutDate','height','fanMark'].map(k=>[k,l[k].verification]))});
    if((i+1)%10===0)console.log(`照合 ${i+1}/${roster.length}`);
  }catch(e){report.failures.push({name:r.name,url,error:e.message});console.log('未取得',r.name,e.message);}
}
const candidates=JSON.parse(fs.readFileSync('public/data/roster-candidates.json','utf8'));
Object.assign(candidates,{checkedAt:stamp,source:listUrl,scope:report.scope,note:'指定の公式一覧と個別プロフィールで照合。Wiki補完項目は各JSONのverificationを参照。旧ストア候補も保持。'});
for(const p of report.profiles){let c=candidates.candidates.find(c=>c.name===p.name);if(!c){c={name:p.name};candidates.candidates.push(c);}Object.assign(c,{status:'verified',liverId:p.id,officialProfileUrl:p.officialUrl,verifiedAt:stamp});}
fs.writeFileSync('public/data/roster-candidates.json',JSON.stringify(candidates,null,2)+'\n');
fs.writeFileSync('public/data/profile-collection-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({official:roster.length,complete:report.profiles.length,failures:report.failures.length,wikiRead:report.profiles.filter(x=>x.wiki.status==='read').length}));
if(report.failures.length)process.exitCode=1;
