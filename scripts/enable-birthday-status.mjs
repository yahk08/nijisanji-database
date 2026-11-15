/** Supports birthdays 'secret', 'private', 'everyday', 'unknown' in the UI.
 * Preview: node scripts/enable-birthday-status.mjs
 * Apply: node scripts/enable-birthday-status.mjs --apply
 * Safe to run after the previous version; creates backups before changes.
 */
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const apply=process.argv.includes('--apply');
function patch(file, transform){
  const p=path.join(root,file);
  if(!fs.existsSync(p))throw Error(`必要なファイルがありません: ${file}`);
  const before=fs.readFileSync(p,'utf8');
  const after=transform(before);
  return {file,p,before,after,changed:before!==after};
}
function replaceExactlyOnce(source,from,to,filename){
  if(source.includes(to))return source;
  if(source.split(from).length!==2)throw Error(`修正位置を特定できないため中断: ${filename} (${from.slice(0,65)})`);
  return source.replace(from,to);
}
const edits=[];
edits.push(patch('src/types.ts',s=>{
  const old="export type FieldValue = { value: string | null;";
  const prior="export type FieldValue = { value: string | null; visibility?: 'secret' | 'private' | 'unknown';";
  const target="export type FieldValue = { value: string | null; visibility?: 'secret' | 'private' | 'everyday' | 'unknown';";
  if(s.includes(target))return s;
  if(s.includes(prior))return replaceExactlyOnce(s,prior,target,'src/types.ts');
  return replaceExactlyOnce(s,old,target,'src/types.ts');
}));
edits.push(patch('src/App.tsx',s=>{
  const oldFn="const formatBirthdayField = (f:FieldValue) => f.value ? formatBirthday(f.value) : (f.visibility==='secret'?'秘密':f.visibility==='private'?'非公開':'未登録');";
  const newFn="const formatBirthdayField = (f:FieldValue) => f.value ? formatBirthday(f.value) : (f.visibility==='secret'?'秘密':f.visibility==='private'?'非公開':f.visibility==='everyday'?'毎日':'未登録');";
  if(s.includes(oldFn))s=replaceExactlyOnce(s,oldFn,newFn,'src/App.tsx');
  else if(!s.includes(newFn))s=replaceExactlyOnce(s,'const validHttp =',newFn+'\nconst validHttp =','src/App.tsx');
  s=replaceExactlyOnce(s,'function displayField(f:FieldValue, birthday=false) {return birthday?formatBirthday(f.value):str(f.value);}', 'function displayField(f:FieldValue, birthday=false) {return birthday?formatBirthdayField(f):str(f.value);}', 'src/App.tsx');
  s=replaceExactlyOnce(s,'value:formatBirthday(liver.birthday.value)','value:formatBirthdayField(liver.birthday)','src/App.tsx');
  return s;
}));
const changes=edits.filter(e=>e.changed);
console.log(`誕生日表示の修正対象: ${changes.length}ファイル`);
if(!apply){console.log('確認のみ。更新するには --apply を付けてください。');process.exit(0)}
if(!changes.length){console.log('すでに修正済み。');process.exit(0)}
const backup=path.join(root,'.birthday-display-backup-'+new Date().toISOString().replace(/[:.]/g,'-'));
for(const e of changes){const dest=path.join(backup,e.file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(e.p,dest)}
for(const e of changes){fs.writeFileSync(e.p,e.after)}
console.log('更新完了。バックアップ: '+backup);
