export const chunks=(items,size=50)=>Array.from({length:Math.ceil(items.length/size)},(_,i)=>items.slice(i*size,(i+1)*size));
export function videoFromAPI(v,now){
  const s=v.snippet,live=v.liveStreamingDetails||{};
  if(!s||v.status?.privacyStatus==='private')return null;
  const status=live.actualEndTime?'archive':live.actualStartTime?'live':s.liveBroadcastContent==='live'?'live':s.liveBroadcastContent==='upcoming'?'upcoming':live.scheduledStartTime?'upcoming':'video';
  return {id:v.id,channelId:s.channelId,title:s.title,status,publishedAt:s.publishedAt||null,scheduledStartAt:live.scheduledStartTime||null,url:`https://www.youtube.com/watch?v=${v.id}`,thumbnailUrl:s.thumbnails?.medium?.url||null,checkedAt:now};
}
export function positiveLimit(raw,fallback,max){if(raw===undefined||raw==='')return fallback;const n=Number(raw);if(!Number.isInteger(n)||n<0||n>max)throw Error('クォータ設定は範囲内の整数にしてください');return n;}
export function consume(usage,kind,limit){if(usage[kind]>=limit)throw Error(`localQuota:${kind}`);usage[kind]++;}
export function isFresh(v,now=Date.now()){return !!v.checkedAt&&now-Date.parse(v.checkedAt)<29*86400000;}
