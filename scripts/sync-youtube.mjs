import fs from 'node:fs';
import {chunks,videoFromAPI,positiveLimit,consume,isFresh} from './youtube-core.mjs';
const file='public/data/youtube.json', stateFile='.youtube-state/state.json';
const read=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}};
const now=new Date().toISOString();
const state=read(stateFile,{schemaVersion:1,cursor:0,usage:{}});
const data=state.data||read(file,{schemaVersion:1,updatedAt:null,livers:{}});
const key=process.env.YOUTUBE_API_KEY;
if(!key){
  for(const entry of Object.values(data.livers))entry.videos=entry.videos.filter(v=>isFresh(v));
  fs.mkdirSync('.youtube-state',{recursive:true});
  fs.writeFileSync(stateFile,JSON.stringify({...state,data},null,2)+'\n');
  fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
  console.log('YOUTUBE_API_KEY未設定: API呼び出しなし');process.exit(0);
}
const mode=process.argv.includes('--full')?'full':'state';
const units=positiveLimit(process.env.YOUTUBE_DAILY_UNITS,9000,1000000);
const searches=positiveLimit(process.env.YOUTUBE_DAILY_SEARCH_CALLS,96,100000);
const perRun=positiveLimit(process.env.YOUTUBE_SEARCH_CHANNELS_PER_RUN,1,200);
const ptDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
if(state.usage.day!==ptDay)state.usage={day:ptDay,units:0,search:0};
fs.mkdirSync('.youtube-state',{recursive:true});
const save=()=>fs.writeFileSync(stateFile,JSON.stringify({...state,data},null,2)+'\n');
async function api(endpoint,args){
  consume(state.usage,endpoint==='search'?'search':'units',endpoint==='search'?searches:units);save();
  const url=new URL('https://www.googleapis.com/youtube/v3/'+endpoint);
  for(const [k,v]of Object.entries({...args,key}))url.searchParams.set(k,String(v));
  let r;try{r=await fetch(url,{signal:AbortSignal.timeout(20000)});}catch{throw Error('YouTube API通信失敗');}
  if(!r.ok){let reason='requestFailed';try{reason=(await r.json()).error?.errors?.[0]?.reason||reason;}catch{}throw Error(`YouTube HTTP ${r.status}: ${reason}`);}
  const json=await r.json();if(!Array.isArray(json.items))throw Error('YouTube応答形式が不正');return json.items;
}
const livers=read('public/data/generated/index.json',{}).livers.filter(l=>l.status==='active'&&/^UC[\w-]{22}$/.test(l.youtubeChannelId||'')).sort((a,b)=>a.id.localeCompare(b.id));
const byChannel=new Map(livers.map(l=>[l.youtubeChannelId,l]));
let failed=false;
try{
  for(const l of livers){data.livers[l.id]??={fetchedAt:null,stateCheckedAt:null,videos:[]};data.livers[l.id].videos=data.livers[l.id].videos.filter(v=>isFresh(v));}
  const ids=new Set();
  if(mode==='full'){
    for(const batch of chunks([...byChannel.keys()])){
      const channels=await api('channels',{part:'contentDetails',id:batch.join(','),maxResults:50});
      for(const c of channels){
        const l=byChannel.get(c.id),playlist=c.contentDetails?.relatedPlaylists?.uploads;if(!l||!playlist)continue;
        const items=await api('playlistItems',{part:'contentDetails',playlistId:playlist,maxResults:10});
        for(const v of items)if(v.contentDetails?.videoId)ids.add(v.contentDetails.videoId);
        // Mark success only after videos.list has refreshed the corresponding IDs below.
        data.livers[l.id]._pendingFetchedAt=now;
      }
    }
  }else if(livers.length){
    for(let n=0;n<perRun;n++){
      if(state.usage.search+2>searches)break;
      const l=livers[state.cursor%livers.length];
      for(const eventType of ['live','upcoming']){
        const items=await api('search',{part:'snippet',channelId:l.youtubeChannelId,eventType,type:'video',maxResults:50});
        for(const v of items)if(v.id?.videoId)ids.add(v.id.videoId);
      }
      data.livers[l.id].discoveryCheckedAt=now;
      state.cursor=(state.cursor+1)%livers.length;save();
    }
  }
  for(const l of livers)for(const v of data.livers[l.id].videos)if(mode==='full'||['live','upcoming'].includes(v.status))ids.add(v.id);
  const refreshed=new Set();
  for(const batch of chunks([...ids])){
    const videos=await api('videos',{part:'snippet,liveStreamingDetails,status',id:batch.join(','),maxResults:50});
    const returned=new Map(videos.map(v=>[v.id,v]));
    for(const l of livers)data.livers[l.id].videos=data.livers[l.id].videos.filter(v=>!batch.includes(v.id));
    for(const id of batch){refreshed.add(id);const raw=returned.get(id);if(!raw)continue;const v=videoFromAPI(raw,now);const l=v&&byChannel.get(v.channelId);if(l)data.livers[l.id].videos.push(v);}
  }
  for(const l of livers){
    const entry=data.livers[l.id];
    if(entry._pendingFetchedAt)entry.fetchedAt=now;
    delete entry._pendingFetchedAt;
    entry.stateCheckedAt=now;
    entry.videos.sort((a,b)=>(b.publishedAt||'').localeCompare(a.publishedAt||''));
    entry.videos=[...entry.videos.filter(v=>['live','upcoming'].includes(v.status)),...entry.videos.filter(v=>!['live','upcoming'].includes(v.status)).slice(0,10)];
  }
  data.updatedAt=now;data.lastError=null;
}catch(e){failed=true;data.lastError={at:now,message:e.message};console.error(e.message);}
finally{
  for(const entry of Object.values(data.livers)){delete entry._pendingFetchedAt;entry.videos=entry.videos.filter(v=>isFresh(v));}
  save();fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
}
console.log(`YouTube mode=${mode}, channels=${livers.length}, dailyUnits=${state.usage.units}, dailySearchCalls=${state.usage.search}`);
if(failed)process.exitCode=1;
