import test from 'node:test';
import assert from 'node:assert/strict';
import {extract,merge} from './collect-official-news.mjs';

test('ANYCOLOR公式のHTMLカードから記事と掲載日を取得する',()=>{
 const html='<article><time>2026.11.12</time><span>にじさんじ</span><a href="/news/cpe6viv0azx"><strong>にじさんじから新グッズが登場！</strong></a></article>';
 const arr=extract(html,'https://www.anycolor.co.jp/ja');
 assert.equal(arr.length,1);
 assert.equal(arr[0].url,'https://www.anycolor.co.jp/news/cpe6viv0azx');
 assert.equal(arr[0].publishedAt,'2026-11-12');
});
test('サイト外リンクとページ一覧URLを除外する',()=>{
 const html='<a href="https://example.com/news/fake123">偽のニュース記事です</a><a href="/news">ニュース一覧へ</a>';
 assert.deepEqual(extract(html,'https://www.anycolor.co.jp/ja'),[]);
});
test('取得済み記事を保持し新着を重複なく加える',()=>{
 const a={url:'https://www.anycolor.co.jp/news/oldarticle',title:'前回の公式ニュース',publishedAt:'2026-11-10'};
 const b={url:'https://www.anycolor.co.jp/news/newarticle',title:'イベント開催のお知らせ',publishedAt:'2026-11-12'};
 const previous=merge({news:[]},[a],'2026-11-11T00:00:00Z');
 const next=merge(previous,[a,b],'2026-11-12T00:00:00Z');
 assert.equal(next.news.length,2);
 assert.equal(next.news.find(x=>x.url===a.url).firstSeenAt,previous.news[0].firstSeenAt);
 assert.equal(next.news.find(x=>x.url===b.url).category,'event');
});
