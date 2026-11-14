import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('PWA uses repository scope, precaches shell, serves offline navigation and ignores external links',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'niji-pwa-test-'));
  try{
    fs.mkdirSync(path.join(dir,'dist/assets'),{recursive:true});fs.writeFileSync(path.join(dir,'dist/index.html'),'shell');fs.writeFileSync(path.join(dir,'dist/assets/app.js'),'app');
    const result=spawnSync(process.execPath,[fileURLToPath(new URL('./build-sw.mjs',import.meta.url))],{cwd:dir,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
    const handlers={},cached=[];
    const scope='https://example.com/nijisanji-database/';
    const self={location:{href:scope+'sw.js'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}};
    const caches={open:async()=>({addAll:async urls=>cached.push(...urls)}),match:async url=>url===scope+'index.html'?'cached shell':undefined};
    vm.runInNewContext(fs.readFileSync(path.join(dir,'dist/sw.js'),'utf8'),{self,caches,URL,Response,fetch:async()=>{throw Error('offline');}});
    let install;handlers.install({waitUntil:p=>install=p});await install;assert.ok(cached.includes(scope+'index.html'));assert.ok(cached.includes(scope+'assets/app.js'));
    let response;handlers.fetch({request:{url:scope,mode:'navigate',method:'GET'},respondWith:p=>response=p});assert.equal(await response,'cached shell');
    let intercepted=false;handlers.fetch({request:{url:'https://www.youtube.com/watch?v=demo',method:'GET'},respondWith:()=>intercepted=true});assert.equal(intercepted,false);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
