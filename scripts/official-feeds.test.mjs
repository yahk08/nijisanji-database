import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNews,parseEvents,collectFeeds} from './official-feeds.mjs';
test('news keeps event announcements in news and uses official publication date',()=>{
 const [n]=parseNews({newsList:[{id:'abc',title:'ライブ開催決定',publishedAtForUser:'2026-11-20T03:00:00Z'}]});
 assert.equal(n.category,'news');assert.equal(n.publishedAt,'2026-11-20T03:00:00Z');assert.equal(n.url,'https://www.nijisanji.jp/news/abc');
});
test('events preserve official order and multi-day display date; reject unrelated URLs',()=>{
 const html=items=>`<script id="__NEXT_DATA__">${JSON.stringify({props:{pageProps:{futureOfficialEvents:items}}})}</script>`;
 const e={title:'公式ライブ',url:'https://www.nijisanji.jp/events/test/',displayDate:'2026年12月19日(土)・20日(日)'};
 assert.equal(parseEvents(html([e]))[0].displayDate,e.displayDate);assert.deepEqual(parseEvents(html([])),[]);
 assert.throws(()=>parseEvents(html([{...e,url:'https://example.com/fake'}])));
});
test('one feed failure retains its own last data while the other updates',async()=>{
 const prior={news:[{category:'news',url:'https://www.nijisanji.jp/news/old',title:'古いニュース'},{category:'event',url:'https://www.nijisanji.jp/news/misclassified',title:'古い分類'}]};
 const {result,errors}=await collectFeeds(prior,async url=>{if(url.includes('/api/'))throw Error('offline');return {ok:true,text:async()=>'<script id="__NEXT_DATA__">{"props":{"pageProps":{"futureOfficialEvents":[]}}}</script>'};});
 assert.equal(errors.length,1);assert.equal(result.news.length,1);assert.equal(result.news[0].title,'古いニュース');assert.ok(result.feeds.event.checkedAt);
});
