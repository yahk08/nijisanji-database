/**
 * JSON schema unification, without changing established field values.
 * Preview: node scripts/normalize-liver-schema.mjs
 * Apply:   node scripts/normalize-liver-schema.mjs --apply
 * No network and no changes to IDs, official sources, or supplied content.
 */
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const dir=path.join(root,'public/data/livers');
const apply=process.argv.includes('--apply');
const template=['id','status','name','reading','englishName','affiliation','group','branch','officialProfileUrl','portraitUrl','portraitSourceUrl','youtubeChannelUrl','youtubeChannelId','xUrl','birthday','debutDate','height','fanMark','introduction','fields','changes','visuals','music','events','youtube','provenance'];
const nullable=new Set(['reading','englishName','group','portraitUrl','portraitSourceUrl','youtubeChannelUrl','youtubeChannelId','xUrl']);
const lists=new Set(['fields','changes','visuals','music','events']);
const profileFields=['birthday','debutDate','height','fanMark','introduction'];
const blank=()=>({value:null,verification:'unknown',sources:[],showSources:false});
function fail(msg){throw Error('データ形式統一を中断: '+msg)}
function isRecord(v){return v!==null && typeof v==='object'&&!Array.isArray(v)}
function ordered(obj,keys){let result={};for(let key of keys)if(Object.hasOwn(obj,key))result[key]=obj[key];for(let [key,v]of Object.entries(obj))if(!Object.hasOwn(result,key))result[key]=v;return result}
function fieldNormalize(f, label){
 if(f===undefined||f===null)return blank();
 if(!isRecord(f)||!Object.hasOwn(f,'value'))fail(label+' は value を持つオブジェクトである必要があります');
 if(f.value!==null && typeof f.value!=='string')fail(label+' の値が文字列/null以外です');
 if(f.sources!==undefined && !Array.isArray(f.sources))fail(label+' の sources が配列ではありません');
 if(f.showSources!==undefined && typeof f.showSources!=='boolean')fail(label+' の showSources が真偽値ではありません');
 return ordered({...f,verification:f.verification??(f.value===null?'unknown':'legacy-unreviewed'),sources:f.sources??[],showSources:f.showSources??false},['value','verification','sources','showSources','note']);
}
function normalizeVisual(v,name,i){
 if(!isRecord(v))fail(name+' 衣装'+i+' の形式不正');
 if(typeof v.id!=='string'||!v.id||typeof v.title!=='string')fail(name+' 衣装'+i+' ID/タイトル不足');
 if(!['2D','3D'].includes(v.category))fail(name+' 衣装'+i+' 2D/3D分類が不正');
 if(v.variants!==undefined&&!Array.isArray(v.variants))fail(name+' 衣装差分の形式不正');
 const variants=(v.variants??[]).map((s,j)=>{
  if(!isRecord(s)||typeof s.id!=='string'||typeof s.name!=='string')fail(name+' 衣装差分'+j+' ID/名前不足');
  return ordered({date:null,imageUrl:null,...s},['id','name','date','imageUrl']);
 });
 return ordered({kind:'未分類',date:null,imageUrl:null,revealUrl:null,...v,variants},['id','title','category','kind','date','imageUrl','revealUrl','variants']);
}
function normalizeMusic(v,name,i){
 if(!isRecord(v)||typeof v.id!=='string'||typeof v.title!=='string'||!['original','cover','participation'].includes(v.category))fail(name+' 楽曲'+i+' の形式不正');
 if(v.participantIds!==undefined&&!Array.isArray(v.participantIds))fail(name+' 楽曲の参加者ID形式不正');
 return ordered({date:null,participantIds:[],youtubeUrl:null,thumbnailUrl:null,...v},['id','title','category','date','participantIds','youtubeUrl','thumbnailUrl']);
}
function normalizeEvent(v,name,i){
 if(!isRecord(v)||typeof v.id!=='string'||typeof v.title!=='string'||!['milestone','event','other'].includes(v.category))fail(name+' 活動履歴'+i+' の形式不正');
 return ordered({date:null,...v},['id','title','category','date','description']);
}
export function normalizeLiver(raw,file){
 if(!isRecord(raw)||!raw.id||!raw.name||!raw.officialProfileUrl)fail(file+' に必須情報がありません');
 if(file!==`${raw.id}.json`)fail(file+' と内部IDの不一致（先にID移行を完了してください）');
 if(!/^TMP_[a-z0-9_-]+$/i.test(raw.id))fail(file+' はTMP_形式のIDではありません');
 for(const key of lists)if(raw[key]!==undefined&&!Array.isArray(raw[key]))fail(file+' '+key+' は配列ではありません');
 if(raw.youtube!==undefined&&!isRecord(raw.youtube))fail(file+' youtube形式が不正');
 if(raw.youtube?.videos!==undefined&&!Array.isArray(raw.youtube.videos))fail(file+' youtube.videosが配列ではありません');
 if(raw.fields)for(let [i,g] of raw.fields.entries()){
  if(!isRecord(g)||typeof g.section!=='string'||!Array.isArray(g.items))fail(file+' fields['+i+']形式不正');
 }
 const o={...raw};
 o.status??='active';o.reading??=null;o.englishName??=null;o.affiliation??='にじさんじ';o.group??=null;o.branch??='JP';
 for(let k of nullable)if(o[k]===undefined)o[k]=null;
 for(let k of lists)o[k]??=[];
 for(let k of profileFields)o[k]=fieldNormalize(o[k],file+'/'+k);
 o.fields=o.fields.map((g,i)=>ordered({...g,items:g.items.map((item,j)=>{
  if(!isRecord(item)||typeof item.label!=='string')fail(file+' fields['+i+'].items['+j+'] 不正');
  return ordered({...item,data:fieldNormalize(item.data,file+'/fields/'+i+'/'+j)},['label','data']);
 })},['section','items']));
 o.visuals=o.visuals.map((v,i)=>normalizeVisual(v,file,i));
 o.music=o.music.map((v,i)=>normalizeMusic(v,file,i));
 o.events=o.events.map((v,i)=>normalizeEvent(v,file,i));
 o.youtube=ordered({fetchedAt:null,stateCheckedAt:null,videos:[],...(o.youtube??{})},['fetchedAt','stateCheckedAt','videos']);
 if(o.provenance===undefined)o.provenance=null;
 return ordered(o,template);
}
function main(){
 if(!fs.existsSync(path.join(root,'package.json'))||!fs.existsSync(dir))fail('nijisanji-databaseのルートで実行してください');
 const files=fs.readdirSync(dir).filter(x=>x.endsWith('.json')&&!x.startsWith('demo_')).sort();
 if(files.length<150)fail('対象ファイル数が少なすぎます: '+files.length);
 const output=new Map(),ids=new Set(),names=new Set(),urls=new Set();let changed=0;
 for(const file of files){
  const full=path.join(dir,file),raw=JSON.parse(fs.readFileSync(full,'utf8'));
  if(ids.has(raw.id)||names.has(raw.name)||urls.has(raw.officialProfileUrl))fail('重複データ: '+raw.name);
  ids.add(raw.id);names.add(raw.name);urls.add(raw.officialProfileUrl);
  const updated=normalizeLiver(raw,file);
  // Do not alter semantic data; preserve all extra fields and existing values.
  const encoded=JSON.stringify(updated,null,2)+'\n';
  if(fs.readFileSync(full,'utf8')!==encoded){output.set(full,encoded);changed++;}
 }
 console.log(`ライバー ${files.length}人 / ID重複 0 / 修正予定 ${changed}ファイル`);
 if(!apply){console.log('確認のみ。変更する場合は --apply を指定してください。');return}
 if(!changed){console.log('共通形式への統一済み。ファイル変更なし。');return}
 const now=new Date().toISOString().replace(/[:.]/g,'-');
 const backup=path.join(path.dirname(root),'nijisanji-database-schema-backup-'+now);
 if(fs.existsSync(backup))fail('バックアップ先が既に存在');
 const backupDir=path.join(backup,'public/data/livers');fs.mkdirSync(backupDir,{recursive:true});
 for(const file of files)fs.copyFileSync(path.join(dir,file),path.join(backupDir,file));
 try{
  for(const [full,data] of output){const tmp=full+'.tmp';fs.writeFileSync(tmp,data);fs.renameSync(tmp,full)}
  for(const file of files){const obj=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));normalizeLiver(obj,file)}
  console.log(`統一完了: ${changed}ファイル / バックアップ: ${backup}`);
 }catch(e){
  for(const file of files)fs.copyFileSync(path.join(backupDir,file),path.join(dir,file));
  throw e;
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))main();
