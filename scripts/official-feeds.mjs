import crypto from 'node:crypto';
export const NEWS_PAGE='https://www.nijisanji.jp/news';
export const EVENTS_PAGE='https://www.nijisanji.jp/events';
// Public endpoint used by /news itself (locale ja, all categories).
export const NEWS_API='https://www.nijisanji.jp/api/news?limit=12&offset=0&filterBy=&locale=ja';
const id=url=>crypto.createHash('sha1').update(url).digest('hex').slice(0,16);
export function parseNews(data){
  if(!Array.isArray(data.newsList)||!data.newsList.length)throw Error('公式ニュースの一覧形式が不正です');
  return data.newsList.map(n=>{
    if(typeof n.id!=='string'||!/^[-\w]+$/.test(n.id)||typeof n.title!=='string'||!n.title.trim())throw Error('公式ニュース項目が不正です');
    const url=`${NEWS_PAGE}/${n.id}`;
    return {id:id(url),title:n.title,url,category:'news',publishedAt:n.publishedAtForUser||null};
  });
}
export function parseEvents(html){
  const raw=html.match(/<script\b[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  const events=raw&&JSON.parse(raw).props?.pageProps?.futureOfficialEvents;
  if(!Array.isArray(events))throw Error('公式イベントの一覧形式が不正です');
  return events.map(e=>{
    const u=new URL(e.url);
    if(u.protocol!=='https:'||u.hostname!=='www.nijisanji.jp'||!u.pathname.startsWith('/events/')||typeof e.title!=='string'||!e.title.trim())throw Error('公式イベント項目が不正です');
    return {id:id(e.url),title:e.title,url:e.url,category:'event',publishedAt:null,displayDate:e.displayDate||''};
  });
}
export async function collectFeeds(previous,fetcher=fetch,now=new Date().toISOString()){
  const result={schemaVersion:1,source:NEWS_PAGE,eventSource:EVENTS_PAGE,checkedAt:previous.checkedAt||null,news:[],feeds:{...previous.feeds}};
  const errors=[];
  for(const [category,url,parse] of [['news',NEWS_API,parseNews],['event',EVENTS_PAGE,parseEvents]]){
    try{
      const response=await fetcher(url,{signal:AbortSignal.timeout(25000),headers:{'User-Agent':'Mozilla/5.0 NijiDatabasePersonal/2.0'}});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      const items=parse(category==='news'?await response.json():await response.text());
      result.news.push(...items);result.feeds[category]={checkedAt:now,source:category==='news'?NEWS_PAGE:EVENTS_PAGE};
    }catch(error){
      errors.push(`${category}: ${error.message}`);
      // Keep only previously collected data from the requested source, not old keyword-classified news.
      result.news.push(...(previous.news||[]).filter(n=>n.category===category&&n.url?.startsWith(category==='news'?NEWS_PAGE+'/':EVENTS_PAGE+'/')));
      result.feeds[category]={...result.feeds[category],error:String(error.message)};
    }
  }
  if(!errors.length)result.checkedAt=now;
  return {result,errors};
}
