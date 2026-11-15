/**
 * Migrate existing liver identity + JSON filenames to TMP_<official-slug>.
 * Run from repository root:
 *   node scripts/migrate-liver-ids.mjs         (preview)
 *   node scripts/migrate-liver-ids.mjs --apply (write + backup)
 * DO NOT execute migrate-readable-liver-files.mjs after this migration.
 * Does not access the network or modify GitHub directly.
 */
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd(), dataDir=path.join(root,'public/data'), dir=path.join(dataDir,'livers');
const apply=process.argv.includes('--apply');
const isFile=p=>fs.existsSync(p)&&fs.statSync(p).isFile();
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const serialize=o=>JSON.stringify(o,null,2)+'\n';
function fail(s){throw Error('ID移行を中断: '+s)}
const recursiveFiles=(folder)=>fs.existsSync(folder)?fs.readdirSync(folder,{withFileTypes:true}).flatMap(e=>e.isDirectory()?recursiveFiles(path.join(folder,e.name)):e.isFile()?[path.join(folder,e.name)]:[]):[];
function toJsonReplaced(node, map){
  if(typeof node==='string')return map[node]??node;
  if(Array.isArray(node))return node.map(x=>toJsonReplaced(x,map));
  if(node && typeof node==='object'){
    const out={};
    for(const [k,v] of Object.entries(node)){
      const nk=map[k]??k;
      if(Object.hasOwn(out,nk))fail('JSON内のキーが衝突: '+nk);
      out[nk]=toJsonReplaced(v,map);
    }
    return out;
  }
  return node;
}
function patchedOnce(source,before,after,filename){
  if(source.includes(after))return source;
  if(source.split(before).length!==2)fail('コード形式が異なります: '+filename+' / '+before.slice(0,70));
  return source.replace(before,after);
}
if(!isFile(path.join(root,'package.json'))||!fs.existsSync(dir))fail('nijisanji-databaseのルートで実行してください');
const originals=fs.readdirSync(dir).filter(n=>n.endsWith('.json')&&!n.startsWith('demo_')).sort();
if(originals.length<150)fail('個別JSONが少なすぎます: '+originals.length);
const plan=[], usedNames=new Set(), usedOldIds=new Set(), usedNewIds=new Set(), usedUrls=new Set();
for(const file of originals){
  const source=read(path.join(dir,file));
  const match=String(source.officialProfileUrl||'').match(/^https:\/\/www\.nijisanji\.jp\/talents\/l\/([a-z0-9-]+)\/?$/i);
  if(!match||!source.id||!source.name)fail('公式URL・名前・ID不足: '+file);
  const slug=match[1].toLowerCase().replaceAll('-','_');
  // Preserve original legacy TMP spelling even if official slug ordering differs.
  const newId=/^TMP_[a-z0-9_-]+\.json$/i.test(file)?file.slice(0,-5):'TMP_'+slug;
  const newFile=newId+'.json';
  if(!/^TMP_[a-z0-9_-]+$/i.test(newId))fail('新ID形式不正: '+newId);
  if(usedNames.has(newFile)||usedOldIds.has(source.id)||usedNewIds.has(newId)||usedUrls.has(source.officialProfileUrl))fail('同名・同ID・公式プロフィールURLの重複: '+source.name);
  usedNames.add(newFile);usedOldIds.add(source.id);usedNewIds.add(newId);usedUrls.add(source.officialProfileUrl);
  plan.push({oldFile:file,newFile,oldId:source.id,newId,name:source.name,source});
}
const idMap=Object.fromEntries(plan.filter(p=>p.oldId!==p.newId).map(p=>[p.oldId,p.newId]));
const newIdToLiver=new Map(plan.map(p=>[p.newId,p]));
// Prevent old mapping values from pointing to nonexistent targets.
const aliasesPath=path.join(dataDir,'liver-id-aliases.json');
const previousAliases=isFile(aliasesPath)?read(aliasesPath):{schemaVersion:1,aliases:{}};
if(previousAliases.schemaVersion!==1||typeof previousAliases.aliases!=='object'||!previousAliases.aliases)fail('既存aliasファイル形式が異なります');
const aliases={...previousAliases.aliases};
for(const [a,b] of Object.entries(aliases))aliases[a]=idMap[b]||b;
for(const [a,b] of Object.entries(idMap))aliases[a]=b;
for(const [a,b] of Object.entries(aliases))if(!newIdToLiver.has(b)||a===b)delete aliases[a];
const edits=new Map();
function edit(file,content){edits.set(file,content)}
// Update all live/data JSON, including references (liverId, participantIds, keyed YouTube data,
// portrait-sources, roster candidates, source reports, and identity baseline).
for(const file of recursiveFiles(dataDir).filter(p=>p.endsWith('.json')&&!p.startsWith(path.join(dataDir,'history')+path.sep))){
  const j=toJsonReplaced(read(file),idMap);
  if(path.dirname(file)===dir){
    const p=plan.find(p=>p.oldFile===path.basename(file));
    if(!p)continue; // old demo sample retained without changes
    j.id=p.newId;
    const dest=path.join(dir,p.newFile);
    edit(dest,serialize(j));
  } else if(file!==aliasesPath)edit(file,serialize(j));
}
edit(aliasesPath,serialize({schemaVersion:1,description:'旧内部IDからTMP内部IDへの移行対応表。古いブックマーク・お気に入り・YouTubeキャッシュ互換用。',aliases}));
// CSV exports sometimes contain old IDs.
for(const relative of ['roster-review.csv','docs/ライバーJSON対応表.csv']){
  const filename=path.join(root,relative);if(!isFile(filename))continue;
  let src=fs.readFileSync(filename,'utf8');
  for(const [before,after] of Object.entries(idMap))src=src.replaceAll(before,after);
  edit(filename,src);
}
// Existing index must also expose aliases, to migrate on-device favorite / gallery classification keys.
const indexFile=path.join(root,'scripts/build-index.mjs');
let indexSrc=fs.readFileSync(indexFile,'utf8');
const origIndex="const index = { generatedAt: new Date().toISOString(), demo: false, livers };";
const newIndex="const aliasesFile='public/data/liver-id-aliases.json';\nconst idAliases=fs.existsSync(aliasesFile)?JSON.parse(fs.readFileSync(aliasesFile,'utf8')).aliases:{};\nconst index = { generatedAt: new Date().toISOString(), demo: false, idAliases, livers };";
indexSrc=patchedOnce(indexSrc,origIndex,newIndex,'scripts/build-index.mjs');
edit(indexFile,indexSrc);
const typeFile=path.join(root,'src/types.ts');
let types=fs.readFileSync(typeFile,'utf8');
types=patchedOnce(types,'demo: boolean; livers: Liver[]','demo: boolean; idAliases?: Record<string,string>; livers: Liver[]','src/types.ts');
edit(typeFile,types);
const appFile=path.join(root,'src/App.tsx');
let app=fs.readFileSync(appFile,'utf8');
const favor="  const liver=livers.find(l=>l.id===route.id);";
const effect=`  // One-time upgrade of on-device identifiers when TMP IDs replace old niji IDs.
  useEffect(()=>{
    const aliases=dataset?.idAliases;
    if(!aliases||!Object.keys(aliases).length)return;
    setFavoriteIds(prev=>{const next=[...new Set(prev.map(id=>aliases[id]||id))];return JSON.stringify(next)===JSON.stringify(prev)?prev:next;});
    setVisualCategories(prev=>{let changed=false;const next:typeof prev={};for(const [key,value] of Object.entries(prev)){const sep=key.indexOf(':');const id=sep<0?key:key.slice(0,sep);const rest=sep<0?'':key.slice(sep);const newKey=(aliases[id]||id)+rest;if(newKey!==key)changed=true;next[newKey]=value;}return changed?next:prev;});
    if(route.id&&aliases[route.id])location.replace(routeFor('profile',aliases[route.id]));
  },[dataset,route.id]);
`;
app=patchedOnce(app,favor,effect+favor,'src/App.tsx');
edit(appFile,app);
// On future data restoration from GitHub Actions cache, translate historical YouTube keys.
const youtubeNormalizer=path.join(root,'scripts/normalize-youtube-ids.mjs');
const normalizer=`/** Normalize YouTube data keys after restoring an older GitHub Actions cache. */
import fs from 'node:fs';
const read=p=>{try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch{return null}};
const idMap=read('public/data/liver-id-aliases.json')?.aliases||{};
export function normalize(data){
  if(!data||typeof data!=='object'||!data.livers)return data;
  const out={...data.livers};
  for(const [oldId,newId] of Object.entries(idMap)){
    if(!Object.hasOwn(out,oldId))continue;
    if(!Object.hasOwn(out,newId))out[newId]=out[oldId];
    else if((out[oldId]?.videos||[]).length>(out[newId]?.videos||[]).length)out[newId]=out[oldId];
    delete out[oldId];
  }
  data.livers=out;return data;
}
if(process.argv[1] && new URL(import.meta.url).pathname.endsWith('/normalize-youtube-ids.mjs')){
  for(const file of ['public/data/youtube.json','.youtube-state/state.json']){
    const obj=read(file);if(!obj)continue;
    if(file.includes('state.json')&&obj.data)normalize(obj.data);else normalize(obj);
    fs.writeFileSync(file,JSON.stringify(obj,null,2)+'\\n');
  }
}
`;
// Do not overwrite a hand-edited existing tool.
if(isFile(youtubeNormalizer) && fs.readFileSync(youtubeNormalizer,'utf8')!==normalizer)fail('normalize-youtube-ids.mjsの内容が異なるため安全停止');
edits.set(youtubeNormalizer,normalizer);
const workflow=path.join(root,'.github/workflows/pages.yml');
let wf=fs.readFileSync(workflow,'utf8');
const restoreLine='      - run: npm run build:index';
const newRestoreLine='      - name: Translate old YouTube ID cache\n        run: node scripts/normalize-youtube-ids.mjs\n'+restoreLine;
wf=patchedOnce(wf,restoreLine,newRestoreLine,'.github/workflows/pages.yml');
edit(workflow,wf);
const youtubeScript=path.join(root,'scripts/sync-youtube.mjs');
let youtube=fs.readFileSync(youtubeScript,'utf8');
const dataLine="const data=state.data||read(file,{schemaVersion:1,updatedAt:null,livers:{}});";
const normalizeBlock="const data=state.data||read(file,{schemaVersion:1,updatedAt:null,livers:{}});\n// Preserve API history stored under identifiers from before the TMP migration.\nconst aliases=read('public/data/liver-id-aliases.json',{aliases:{}}).aliases||{};\nfor(const [oldId,newId] of Object.entries(aliases)){\n  if(!data.livers?.[oldId])continue;\n  if(!data.livers[newId]||data.livers[oldId].videos?.length>data.livers[newId].videos?.length)data.livers[newId]=data.livers[oldId];\n  delete data.livers[oldId];\n}";
youtube=patchedOnce(youtube,dataLine,normalizeBlock,'scripts/sync-youtube.mjs');
edit(youtubeScript,youtube);
// New registrations must continue using human-readable TMP IDs rather than opaque niji IDs.
const collect=path.join(root,'scripts/collect-profiles.mjs');let collectSrc=fs.readFileSync(collect,'utf8');
collectSrc=patchedOnce(collectSrc,"id:'niji_'+d.id","id:'TMP_'+r.slug.replaceAll('-','_')",'scripts/collect-profiles.mjs');
edit(collect,collectSrc);
const complete=path.join(root,'scripts/complete-liver-roster.mjs');let completeSrc=fs.readFileSync(complete,'utf8');
completeSrc=patchedOnce(completeSrc,"const id='niji_'+String(d.id);","const id='TMP_'+new URL(url).pathname.split('/').pop().replaceAll('-','_');",'scripts/complete-liver-roster.mjs');
completeSrc=patchedOnce(completeSrc,"if(!/^niji_[A-Za-z0-9_-]+$/.test(id))","if(!/^TMP_[A-Za-z0-9_-]+$/.test(id))",'scripts/complete-liver-roster.mjs');
edit(complete,completeSrc);

// Verify that all target files are unique and every reference has a valid mapping.
const changedFiles=plan.filter(p=>p.oldFile!==p.newFile||p.oldId!==p.newId);
console.log(`現状 ${plan.length}人 / 内部ID変更 ${Object.keys(idMap).length}件 / ファイル名変更 ${plan.filter(p=>p.oldFile!==p.newFile).length}件`);
console.log(`更新する関連ファイル: ${edits.size}件（JSON・コード・設定を含む）`);
for(const p of changedFiles.slice(0,8))console.log(` ${p.name}: ${p.oldId} → ${p.newId}`);
if(!apply){console.log('確認のみで変更していません。実行は --apply を付けてください。');process.exit(0);}
if(!changedFiles.length){console.log('ライバーIDの変更対象はありません（移行済みの可能性）。');process.exit(0);}
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const backup=path.join(path.dirname(root),`nijisanji-database-ID-backup-${stamp}`);
if(fs.existsSync(backup))fail('バックアップ先が存在します');
fs.mkdirSync(backup,{recursive:true});
for(const relative of ['public/data','scripts','src','.github/workflows','docs']){
  const source=path.join(root,relative);
  if(fs.existsSync(source))fs.cpSync(source,path.join(backup,relative),{recursive:true});
}
for(const rel of ['roster-review.csv'])if(isFile(path.join(root,rel)))fs.copyFileSync(path.join(root,rel),path.join(backup,rel));
const originalPaths=new Set(originals.map(x=>path.join(dir,x)));
try{
  // Delete old files only after everything has been serialized and backed up.
  for(const old of originalPaths)fs.unlinkSync(old);
  for(const [file,content]of edits){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);}
  const after=fs.readdirSync(dir).filter(f=>f.endsWith('.json')&&!f.startsWith('demo_'));
  if(after.length!==plan.length)fail('個別ファイル数が変わりました');
  const expected=new Set(plan.map(p=>p.newId));
  for(const file of after){const obj=read(path.join(dir,file));if(obj.id+'.json'!==file||!expected.has(obj.id))fail('移行後のファイル名とIDの不整合: '+file);}
  const csv='\uFEFFライバー名,新しいID,以前のID,JSONファイル名\r\n'+plan.sort((a,b)=>a.name.localeCompare(b.name,'ja')).map(p=>[p.name,p.newId,p.oldId,p.newFile].map(x=>'"'+String(x).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
  fs.mkdirSync(path.join(root,'docs'),{recursive:true});
  fs.writeFileSync(path.join(root,'docs/ライバーID変更対応表.csv'),csv);
  console.log(`移行成功：${after.length}人 / ID変更${Object.keys(idMap).length}件`);
  console.log('バックアップ: '+backup);
  console.log('次は npm.cmd run build:index → npm.cmd run validate:data → npm.cmd run validate:roster → npm.cmd test → npm.cmd run build の順で検証してください。');
}catch(e){
  console.error('処理失敗、バックアップから復元します: '+e.message);
  for(const relative of ['public/data','scripts','src','.github/workflows','docs']){
    const dest=path.join(root,relative),source=path.join(backup,relative);
    if(fs.existsSync(dest))fs.rmSync(dest,{recursive:true,force:true});
    if(fs.existsSync(source))fs.cpSync(source,dest,{recursive:true});
  }
  const c=path.join(backup,'roster-review.csv');if(isFile(c))fs.copyFileSync(c,path.join(root,'roster-review.csv'));
  throw e;
}
