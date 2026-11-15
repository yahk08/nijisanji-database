/** Normalize YouTube data keys after restoring an older GitHub Actions cache. */
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
    fs.writeFileSync(file,JSON.stringify(obj,null,2)+'\n');
  }
}
