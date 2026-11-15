/** Manual NIJI workbook importer. Preview by default; writes ONLY with --apply.
 * Input: manual-liver-input.json generated from scripts/excel-to-json.py
 * Matching key: officialProfileUrl, independent of future TMP_ ID migration.
 * Existing values are never overwritten by default, empty cells do nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.cwd(), sourceDir=path.join(root,'public/data/livers');
const jsonFile=process.argv.find(x=>x.endsWith('.json')&&x!=='--apply')||'manual-liver-input.json';
const apply=process.argv.includes('--apply');
const overwrite=process.argv.includes('--overwrite-existing');
const allowFace=process.argv.includes('--allow-face');
const abort=(s)=>{console.error('エラー:',s);process.exit(1)};
if(!fs.existsSync(sourceDir))abort('nijisanji-database のフォルダー内で実行してください');
if(!fs.existsSync(jsonFile))abort('入力ファイルがありません: '+jsonFile);
const input=JSON.parse(fs.readFileSync(jsonFile,'utf8'));
if(input.schemaVersion!==1||!input.sheets)abort('入力形式が不正です');
const files=fs.readdirSync(sourceDir).filter(f=>f.endsWith('.json')&&!f.startsWith('demo_'));
const people=new Map(), byName=new Map();
for(const file of files){const l=JSON.parse(fs.readFileSync(path.join(sourceDir,file),'utf8'));
 if(!l.officialProfileUrl||people.has(l.officialProfileUrl))abort('公式プロフィールURLが重複・空欄: '+file);
 people.set(l.officialProfileUrl,{file,l,original:JSON.stringify(l)});byName.set(l.name,l);
}
const errors=[],warnings=[],modifications=[],stats={matched:0,portrait:0,fields:0,links:0,visuals:0,variants:0,music:0,events:0,skipped:0,unchanged:0};
const str=v=>v===null||v===undefined?'':String(v).trim();
const url=v=>{const s=str(v);if(!s)return '';try{const u=new URL(s);if(u.protocol!=='https:')return '';return s}catch{return ''}};
const human=(v)=>str(v).normalize('NFKC');
const date=v=>{let s=str(v);if(!s)return null;if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;errors.push('日付形式が不正: '+s);return null};
// The date value is kept null when a birthday is secret/private/unknown.
// Its public visibility is stored separately, so a non-date value never breaks sorting.
const birthday=v=>{
 const original=str(v), s=original.normalize('NFKC').replace(/[\s\u3000]+/g,'');
 if(!s)return null;
 const statuses={
  '秘密':{visibility:'secret',label:'秘密'},
  '秘密ヒミツ':{visibility:'secret',label:'秘密'},
  'ヒミツ':{visibility:'secret',label:'秘密'},
  '非公開':{visibility:'private',label:'非公開'},
  '非公表':{visibility:'private',label:'非公開'},
  '未公開':{visibility:'private',label:'非公開'},
  '毎日':{visibility:'everyday',label:'毎日'},
  '毎日マイニチ':{visibility:'everyday',label:'毎日'},
  'マイニチ':{visibility:'everyday',label:'毎日'},
  '不明':{visibility:'unknown',label:'不明'},
  '不詳':{visibility:'unknown',label:'不明'},
  '未登録':{visibility:'unknown',label:'不明'},
 };
 if(Object.hasOwn(statuses,s))return {value:null,...statuses[s]};
 let m,d;
 if(/^\d+(?:\.0)?$/.test(s)){
  const n=Math.trunc(Number(s));m=Math.trunc(n/100);d=n%100;
 }else{
  const match=s.match(/^(\d{1,2})[-\/月](\d{1,2})(?:日)?$/);
  if(!match)return {error:`対応していない誕生日の形式: ${original}`};
  m=Number(match[1]);d=Number(match[2]);
 }
 // 2000 is a leap year, allowing 02-29 while rejecting impossible dates.
 const check=new Date(Date.UTC(2000,m-1,d));
 if(m<1||m>12||d<1||d>31||check.getUTCMonth()!==m-1||check.getUTCDate()!==d)
  return {error:`存在しない月日: ${original}`};
 return {value:`${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,visibility:null,label:original};
};
const setBirthday=(l,parsed)=>{
 if(!parsed||parsed.error)return;
 const previous=(l.birthday&&typeof l.birthday==='object')?l.birthday:{};
 const oldValue=previous.value??null,oldVisibility=previous.visibility??null;
 const nextValue=parsed.value,nextVisibility=parsed.visibility;
 // 'unknown' is not evidence to erase a known birthday.
 if(nextVisibility==='unknown'&&oldValue!==null){
  warnings.push(`${l.name} 誕生日: Excelは「不明」ですが登録済みの日付を維持`);stats.skipped++;return;
 }
 if(oldValue===nextValue && oldVisibility===nextVisibility){stats.unchanged++;return}
 if((oldValue!==null || (oldVisibility!==null&&oldVisibility!=='unknown'))&&!overwrite){
  warnings.push(`${l.name} 誕生日: 既存値との差異を保留 (${oldValue||oldVisibility} → ${nextValue||nextVisibility})`);
  stats.skipped++;return;
 }
 // Preserve unrelated properties such as notes/history. Record the entered status accurately.
 const next={...previous,value:nextValue,verification:'legacy-unreviewed',sources:[officialSource(l)],showSources:true};
 if(nextVisibility)next.visibility=nextVisibility;
 else delete next.visibility;
 l.birthday=next;stats.fields++;
};
const officialSource=l=>({label:'にじさんじ公式プロフィール（Excel入力）',url:l.officialProfileUrl,kind:'official'});
const getPerson=(name,profile,context)=>{const u=str(profile);const found=people.get(u);if(!found){errors.push(`${context}: 公式URLに対応するライバーがいません: ${name} / ${u}`);return null}
 if(human(found.l.name)!==human(name)){errors.push(`${context}: 名前と公式URLが一致しません: ${name} / ${found.l.name}`);return null}return found.l};
const setField=(l,key,v,context)=>{if(v===null||v===undefined||str(v)==='')return;
 const value=String(v).trim(), old=l[key]?.value;
 if(old===value){stats.unchanged++;return}
 if(old!==null&&old!==undefined&&old!==''&&!overwrite){warnings.push(`${l.name} ${context}: 既存値との差異を保留 (${old} → ${value})`);stats.skipped++;return}
 const previous=l[key]&&typeof l[key]==='object'?l[key]:{};
 l[key]={...previous,value,verification:'legacy-unreviewed',sources:[officialSource(l)],showSources:true};stats.fields++;
};
const setUrl=(l,key,value,context)=>{if(!str(value))return;
 let u=url(value);if(!u){errors.push(`${l.name}: ${context} URL形式不正`);return}
 if(l[key]===u){stats.unchanged++;return}
 if(l[key]&&!overwrite){warnings.push(`${l.name}: ${context} は既存URLと異なるため保留`);stats.skipped++;return}
 l[key]=u;stats.links++;
};
const linkLabels=[['各種リンク（youtube）','YouTube'],['各種リンク（Twitch）','Twitch'],['各種リンク（Twitter）','X / Twitter'],['各種リンク（ファンクラブ）','ファンクラブ'],['各種リンク（公式ストア）','公式ストア'],['各種リンク（エニマガ）','エニマガ']];
const setExtra=(l,label,value,source)=>{if(!str(value))return;
 let groups=l.fields||(l.fields=[]);let g=groups.find(x=>x.section==='追加プロフィール');if(!g){g={section:'追加プロフィール',items:[]};groups.push(g)}
 let item=g.items.find(x=>x.label===label);if(!item){item={label,data:{value:null,sources:[],showSources:false}};g.items.push(item)}
 let old=item.data?.value;if(old===value){stats.unchanged++;return}
 if(old&&!overwrite){warnings.push(`${l.name}: ${label} の既存値と異なるため保留`);stats.skipped++;return}
 item.data={value:String(value),verification:'legacy-unreviewed',sources:[{label:'手動入力Excel',url:source||l.officialProfileUrl}],showSources:true};stats.fields++;
};
const sheet=(name)=>{const rows=input.sheets[name];if(!Array.isArray(rows)||!rows.length)abort('シートが存在しません: '+name);const h=rows[0];return rows.slice(1).map((values,i)=>({row:i+2,fields:Object.fromEntries(h.map((k,j)=>[k,values?.[j]??null]))})).filter(x=>Object.values(x.fields).some(v=>str(v)!==''))};
const requireUrl=(val,context)=>{let u=url(val);if(!u)errors.push(`${context}: URLが不正です`);return u};
const identityHash=(...parts)=>crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0,15);
const first=sheet('代表画像・プロフィール');const seen=new Set();
for(const {row,fields:f} of first){let l=getPerson(f['ライバー名（変更しない）'],f['公式プロフィールURL（変更しない）'],'代表画像・プロフィール '+row);if(!l)continue;
 if(seen.has(l.id)){errors.push('プロフィール入力が重複: '+l.name);continue}seen.add(l.id);stats.matched++;
 const portrait=str(f['代表立ち絵URL（入力）']);
 if(portrait){let u=requireUrl(portrait,l.name+' 代表画像');if(u){
 const isFace=/liver[-_]face[-_]|liver[-_]head[-_]/i.test(u);
 if(isFace&&!allowFace){warnings.push(`${l.name}: 顔アップ画像の可能性があるため代表立ち絵URLを保留（--allow-face で許可可能）`);stats.skipped++}
 else if(l.portraitUrl&&!overwrite&&l.portraitUrl!==u){warnings.push(`${l.name}: 既存代表画像があるため保留`);stats.skipped++}
 else if(l.portraitUrl!==u){l.portraitUrl=u;stats.portrait++;
 const source=str(f['画像の出典URL'])||l.officialProfileUrl;
 if(!url(source)){errors.push(`${l.name}: 代表画像出典URLが不正`)}else l.portraitSourceUrl=source;
 }}}
 const b=f['誕生日（MM-DD）'];if(str(b)){const parsed=birthday(b);if(parsed?.error)errors.push(`${l.name}: ${parsed.error}`);else setBirthday(l,parsed)}
 const d=f['デビュー日（YYYY-MM-DD）'];if(str(d)){let formatted=date(d);if(formatted)setField(l,'debutDate',formatted,'デビュー日')}
 setField(l,'height',f['身長（例：160cm）'],'身長');setField(l,'fanMark',f['ファンマーク'],'ファンマーク');setField(l,'introduction',f['紹介文'],'紹介文');
 setExtra(l,'ファンネーム',str(f['ファンネーム']),l.officialProfileUrl);
 // Existing primary YouTube and X URLs are not replaced without explicit flag.
 setUrl(l,'youtubeChannelUrl',f['各種リンク（youtube）'],'YouTube');
 setUrl(l,'xUrl',f['各種リンク（Twitter）'],'X/Twitter');
 for(const [excel,label] of linkLabels){let v=str(f[excel]);if(v){let u=requireUrl(v,l.name+' '+label);if(u)setExtra(l,label,u,l.officialProfileUrl)}}
 const note=str(f['備考・修正指示']);if(note)warnings.push(`${l.name}: 備考・修正指示は自動反映せず要確認: ${note.slice(0,160)}`);
}
const visualMap=new Map();
for(const {row,fields:f} of sheet('衣装・ビジュアル')){
 let context='衣装・ビジュアル '+row,l=getPerson(f['ライバー名'],f['公式プロフィールURL'],context);if(!l)continue;
 let title=str(f['衣装管理名（自分で付ける）']),kind=str(f['分類'])||'未分類',category=str(f['種類（2D/3D）']),link=requireUrl(f['衣装画像URL'],context);
 if(!title||!['2D','3D'].includes(category)||!link){errors.push(context+': 衣装名・種類・画像URLが必要');continue}
 let k=l.id+'|'+title;if(visualMap.has(k)){errors.push(context+': 衣装管理名が重複');continue}
 let v=l.visuals.find(v=>v.title===title)||l.visuals.find(v=>v.imageUrl===link);
 if(!v){let id='manual-'+identityHash(l.officialProfileUrl,title,link);v={id,title,category,kind,date:date(f['公開日（YYYY-MM-DD）']),imageUrl:link,revealUrl:url(f['お披露目動画URL'])||null,variants:[{id:id+'-full',name:'全身',date:date(f['公開日（YYYY-MM-DD）']),imageUrl:link}],sources:[{label:'手動入力Excel',url:url(f['出典URL'])||l.officialProfileUrl}],verification:'legacy-unreviewed'};l.visuals.push(v);stats.visuals++}
 else{if(v.imageUrl!==link)warnings.push(`${l.name}: 既存の同名衣装画像との差異を保留: ${title}`);stats.skipped++}
 visualMap.set(k,v);
}
for(const {row,fields:f} of sheet('衣装差分')){
 let context='衣装差分 '+row,l=getPerson(f['ライバー名'],f['公式プロフィールURL'],context);if(!l)continue;
 let title=str(f['対応する衣装管理名']),name=str(f['差分名（髪型・小物など）']),link=requireUrl(f['差分画像URL'],context);
 let v=visualMap.get(l.id+'|'+title)||l.visuals.find(v=>v.title===title);
 if(!v||!name||!link){errors.push(context+': 対応衣装・差分名・画像URLのいずれかがありません');continue}
 if(v.variants.some(x=>x.name===name||x.imageUrl===link)){stats.unchanged++;continue}
 v.variants.push({id:'manual-variant-'+identityHash(l.id,title,name,link),name,date:date(f['公開日（YYYY-MM-DD）']),imageUrl:link});stats.variants++;
}
const allNames=new Map([...people.values()].map(x=>[human(x.l.name),x.l]));
for(const {row,fields:f} of sheet('楽曲')){
 let context='楽曲 '+row,title=str(f['楽曲名']),category=str(f['分類']),video=requireUrl(f['YouTube動画URL'],context);
 let mapping={'オリジナル曲':'original','original':'original','歌ってみた':'cover','cover':'cover','参加曲':'participation','participation':'participation'};
 let participants=str(f['参加ライバー名（読点区切り）']).split(/[、,，]/).map(human).filter(Boolean);
 if(!title||!mapping[category]||!participants.length||!video){errors.push(context+': 楽曲名・分類・参加者・URLのいずれかが不正');continue}
 let ls=participants.map(n=>allNames.get(n));if(ls.some(x=>!x)){errors.push(context+': 参加者が未登録: '+participants.filter(n=>!allNames.has(n)).join(','));continue}
 let ids=[...new Set(ls.map(x=>x.id))];let id='manual-music-'+identityHash(title,video);
 for(const l of ls){if(l.music.some(m=>m.youtubeUrl===video||m.id===id)){stats.unchanged++;continue}
 l.music.push({id,title,category:mapping[category],date:date(f['公開日（YYYY-MM-DD）']),participantIds:ids,youtubeUrl:video,thumbnailUrl:null,sources:[{label:'手動入力Excel',url:url(f['出典URL'])||video}]});stats.music++}
}
for(const {row,fields:f} of sheet('活動履歴')){
 let context='活動履歴 '+row,l=getPerson(f['ライバー名'],f['公式プロフィールURL'],context);if(!l)continue;
 let title=str(f['出来事のタイトル']),raw=str(f['種類']);let kinds={'イベント':'event','記念配信':'milestone','登録者数達成':'milestone','milestone':'milestone','event':'event','other':'other','その他':'other'};
 if(!title){errors.push(context+': タイトルが未入力');continue}
 let category=kinds[raw]||'other',day=date(f['日付（YYYY-MM-DD）']),link=url(f['関連動画・記事URL']);let id='manual-event-'+identityHash(l.id,title,day);
 if(l.events.some(e=>e.id===id||e.title===title&&e.date===day)){stats.unchanged++;continue}
 l.events.push({id,title,category,date:day,description:str(f['備考'])||undefined,url:link||undefined,sources:[{label:'手動入力Excel',url:url(f['出典URL'])||l.officialProfileUrl}]});stats.events++;
}
const staged=[...people.values()].filter(x=>JSON.stringify(x.l)!==x.original);
console.log(`読み込み人数: ${stats.matched}/${people.size}; 変更対象JSON: ${staged.length}`);
console.log('変更候補:',JSON.stringify(stats));
for(const w of warnings.slice(0,70))console.warn('確認:',w);
if(warnings.length>70)console.warn(`確認メッセージ残り ${warnings.length-70} 件`);
for(const e of errors.slice(0,70))console.error('エラー:',e);
if(errors.length)abort(`不一致 ${errors.length} 件。ファイルを書き換えていません`);
if(!apply){console.log('プレビュー完了。変更する場合: node scripts/import-manual-livers.mjs --apply');process.exit(0)}
// Atomic individual file writes; keep a full backup first.
const backup=path.join(root,'.manual-excel-backups',new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
for(const x of staged)fs.copyFileSync(path.join(sourceDir,x.file),path.join(backup,x.file));
for(const x of staged){const p=path.join(sourceDir,x.file),tmp=p+'.manualtmp';fs.writeFileSync(tmp,JSON.stringify(x.l,null,2)+'\n');fs.renameSync(tmp,p)}
console.log('更新完了:',staged.length,'件。バックアップ:',backup);
console.log('続けて npm.cmd run build:index、validate:data、validate:roster、test、build を実行してください');
