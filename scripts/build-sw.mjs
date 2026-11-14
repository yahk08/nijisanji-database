import fs from 'node:fs';
import crypto from 'node:crypto';
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+'/'+e.name):[dir+'/'+e.name]);
const files=walk('dist').filter(f=>/\.(html|js|css|png|webmanifest)$/.test(f)).map(f=>f.slice(5));
const version=crypto.createHash('sha256').update(files.map(f=>fs.readFileSync('dist/'+f)).join('')).digest('hex').slice(0,12);
fs.writeFileSync('dist/sw.js',`const CACHE='niji-${version}';
const BASE=new URL('./',self.location.href);
const FILES=${JSON.stringify(files)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES.map(f=>new URL(f,BASE).href))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('niji-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==BASE.origin||!url.pathname.startsWith(BASE.pathname))return;
 if(request.mode==='navigate'){event.respondWith(fetch(request).catch(()=>caches.match(new URL('index.html',BASE).href)));return;}
 if(url.pathname.includes('/data/')){event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(request,copy)));}return response;}).catch(()=>caches.match(request).then(r=>r||Response.error())));return;}
 event.respondWith(caches.match(request).then(hit=>hit||fetch(request)));
});\n`);
console.log('PWA service worker generated:',version);
