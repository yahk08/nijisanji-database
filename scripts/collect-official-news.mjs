/**
 * Collect publicly listed official news, first from NIJISANJI, then as a fallback
 * from the operating company's public Japanese homepage.
 * No login, secret, unofficial feed, or guessed article metadata is used.
 * Preserve last good data on failure. Run: node scripts/collect-official-news.mjs
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = 'public/data/official-news.json';
const REPORT = 'public/data/official-news-report.json';
const PRIMARY = 'https://www.nijisanji.jp/news';
const FALLBACK = 'https://www.anycolor.co.jp/ja';
const EVENT = /ライブ|イベント|フェス|コンサート|公演|開催|出演|舞台|展示|ファンミ|ツアー/i;

function clean(s) {
  return typeof s === 'string' ? s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ').replace(/&(?:amp|#38);/g, '&')
    .replace(/&(?:quot|#34);/g, '"').replace(/&#(?:39|x27);/gi,"'")
    .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() : '';
}
function officialURL(raw, base = PRIMARY) {
  try {
    const u = new URL(raw, base);
    if (!['www.nijisanji.jp', 'www.anycolor.co.jp'].includes(u.hostname)) return null;
    if (u.protocol !== 'https:' || !/^\/news\/[A-Za-z0-9_-]{3,}\/?$/.test(u.pathname)) return null;
    return `${u.origin}${u.pathname.replace(/\/$/, '')}`;
  } catch { return null; }
}
function dateOf(raw) {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/20\d\d[-/.]\d{1,2}[-/.]\d{1,2}/);
  if (!m) return null;
  const [y, mo, d] = m[0].split(/[-/.]/);
  const v = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return !Number.isNaN(Date.parse(v)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v ? v : null;
}
// Only accept validated public official article links and substantive Japanese/English titles.
export function extract(html, base = PRIMARY) {
  const found = new Map();
  const add = (url, title, date) => {
    const u = officialURL(url, base), t = clean(title);
    if (u && t.length >= 5 && t.length <= 250) {
      const prior = found.get(u);
      const item = { url: u, title: t, publishedAt: dateOf(date) || prior?.publishedAt || null };
      if (!prior || t.length > prior.title.length || (!prior.publishedAt && item.publishedAt)) found.set(u, item);
    }
  };
  // Next.js uses various JSON containers: traverse only data objects that carry a title and URL/id.
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  for (const [, attrs, body] of scripts) {
    if (!/__NEXT_DATA__|application\/json|application\/ld\+json/i.test(attrs)) continue;
    let root;
    try { root = JSON.parse(body.trim()); } catch { continue; }
    const seen = new WeakSet();
    function visit(o, depth = 0) {
      if (!o || typeof o !== 'object' || depth > 22 || seen.has(o)) return;
      seen.add(o);
      if (Array.isArray(o)) { for (const el of o) visit(el, depth + 1); return; }
      const title = o.title || o.newsTitle || o.headline || o.heading || o.name;
      const date = o.publishedAt || o.publishDate || o.publishedDate || o.date || o.createdAt || o.published_at;
      let url = o.url || o.href || o.link || o.path;
      const slug = o.slug || o.newsId || o.id;
      if ((!url || typeof url !== 'string') && typeof slug === 'string' && /^[\w-]{3,80}$/.test(slug)) url = `/news/${slug}`;
      if (typeof title === 'string' && typeof url === 'string') add(url, title, date);
      for (const v of Object.values(o)) visit(v, depth + 1);
    }
    visit(root);
  }
  // HTML anchors; nearby date may be outside the anchor itself in a card.
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = m[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href || !officialURL(href, base)) continue;
    const text = clean(m[2]);
    const neighbourhood = html.slice(Math.max(0, m.index - 700), m.index + m[0].length);
    const dates = [...clean(neighbourhood).matchAll(/20\d\d[-/.]\d{1,2}[-/.]\d{1,2}/g)].map(x => x[0]);
    add(href, text, dates.at(-1) || null);
  }
  return [...found.values()];
}
export function merge(previous, items, now) {
  const map = new Map((previous.news || []).filter(x => officialURL(x.url)).map(x => [x.url, x]));
  for (const v of items) {
    const old = map.get(v.url);
    const id = old?.id || crypto.createHash('sha1').update(v.url).digest('hex').slice(0, 16);
    map.set(v.url, {
      id, title: v.title, url: v.url,
      publishedAt: v.publishedAt || old?.publishedAt || null,
      category: EVENT.test(v.title) ? 'event' : 'news',
      firstSeenAt: old?.firstSeenAt || now,
      lastSeenAt: now,
    });
  }
  return {
    schemaVersion: 1, checkedAt: now, source: PRIMARY,
    news: [...map.values()].sort((a,b) => (b.publishedAt || '').localeCompare(a.publishedAt || '') || (b.firstSeenAt || '').localeCompare(a.firstSeenAt || '')).slice(0, 120),
  };
}
async function fetchArticles(source) {
  const response = await fetch(source, {
    signal: AbortSignal.timeout(20000),
    headers: {'User-Agent': 'Mozilla/5.0 (compatible; NijiDatabasePersonalNews/1.1)', 'Accept': 'text/html,application/xhtml+xml'},
  });
  if (!response.ok) throw new Error(`${source}: HTTP ${response.status}`);
  const html = await response.text();
  const articles = extract(html, source);
  if (!articles.length) throw new Error(`${source}: 記事一覧を抽出できませんでした`);
  return articles;
}
async function main() {
  const now = new Date().toISOString();
  const errors = [];
  let sourceUsed = null, items = [];
  for (const source of [PRIMARY, FALLBACK]) {
    try {
      items = await fetchArticles(source);
      sourceUsed = source;
      break;
    } catch (e) { errors.push(String(e.message || e)); }
  }
  const prior = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {schemaVersion:1, checkedAt:null, source:PRIMARY, news:[]};
  const success = items.length > 0;
  const result = success ? merge(prior, items, now) : prior;
  fs.mkdirSync(path.dirname(REPORT), {recursive:true});
  fs.writeFileSync(REPORT, JSON.stringify({checkedAt:now, success, found:items.length, stored:result.news.length, sourceUsed, fallbackUsed:sourceUsed===FALLBACK, errors}, null, 2) + '\n');
  if (!success) {
    console.error('公式ニュースの取得に失敗しました。以前のデータを保持します。\n' + errors.join('\n'));
    process.exitCode = 1;
    return;
  }
  fs.writeFileSync(OUT, JSON.stringify(result,null,2)+'\n');
  console.log(`収集成功: ${items.length}件 / 保存: ${result.news.length}件 / 取得元: ${sourceUsed}`);
  if (errors.length) console.warn('最初の収集元は取得できず、運営会社の公式サイトから取得しました。');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
