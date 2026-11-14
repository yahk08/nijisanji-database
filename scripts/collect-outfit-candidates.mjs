/**
 * Collect image *candidates*, not asserted initial outfits, from public official profiles.
 * Safe mode: never edits liver JSON, portrait-sources.json, or generated/index.json.
 * Usage: node scripts/collect-outfit-candidates.mjs [--cache-only]
 * Uses no YouTube quota/API key. Avoid running concurrently or frequently.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const sourceDir = 'public/data/livers';
const dest = 'public/data/initial-outfit-review.json';
const cacheDir = '.outfit-page-cache';
const cacheOnly = process.argv.includes('--cache-only');
const base = 'https://www.nijisanji.jp/talents/l/';
const count = (process.env.OUTFIT_SCAN_LIMIT && Number(process.env.OUTFIT_SCAN_LIMIT)) || Infinity;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
fs.mkdirSync(cacheDir, { recursive: true });

function nextData(html) {
  const match = html.match(/<script\s+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('公式サイトのページ形式が変わりました（__NEXT_DATA__なし）');
  return JSON.parse(match[1]).props?.pageProps?.liverDetail;
}
function assetURL(text) {
  if (typeof text !== 'string') return null;
  if (!text.startsWith('https://images.microcms-assets.io/')) return null;
  try {
    const u = new URL(text);
    u.searchParams.delete('fm');
    u.searchParams.delete('w');
    return u.toString();
  } catch { return null; }
}
function collectImages(obj, trace = [], out = [], depth = 0, seen = new WeakSet()) {
  if (!obj || typeof obj !== 'object' || depth > 16 || seen.has(obj)) return out;
  seen.add(obj);
  for (const [key, value] of Object.entries(obj)) {
    const p = [...trace, key];
    if (typeof value === 'string') {
      const url = assetURL(value);
      if (url && /(?:liver|costume|full.body|立ち絵|ポーズ|portrait|talent|\.png|\.webp)/i.test(url)) {
        const nearby = Object.entries(obj).filter(([k,v]) => k !== key && typeof v === 'string' && v.length < 140).map(([k,v]) => `${k}: ${v}`).join(' | ');
        out.push({ imageUrl: url, path: p.join('.'), nearby: nearby.slice(0, 350) });
      }
    } else if (value && typeof value === 'object') collectImages(value, p, out, depth + 1, seen);
  }
  return out;
}
async function fetchProfile(url) {
  const key = crypto.createHash('sha256').update(url).digest('hex');
  const cache = path.join(cacheDir, key + '.html');
  if (fs.existsSync(cache)) return fs.readFileSync(cache, 'utf8');
  if (cacheOnly) throw new Error('キャッシュなし（通信なしモード）');
  await pause(1200);
  const res = await fetch(url, { headers: { 'User-Agent': 'NijiDBPersonalProject/1.0 (official-profile-review)' }, signal: AbortSignal.timeout(20000) });
  if (res.status === 403 || res.status === 429) throw new Error(`アクセス制限 HTTP ${res.status}。以降の取得を中止`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  fs.writeFileSync(cache, html);
  return html;
}

const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.json') && !f.startsWith('demo_')).sort();
const livers = files.map(f => JSON.parse(fs.readFileSync(path.join(sourceDir,f),'utf8'))).slice(0, count);
const old = fs.existsSync(dest) ? JSON.parse(fs.readFileSync(dest, 'utf8')) : null;
const previous = new Map((old?.livers || []).map(x => [x.id, x]));
const result = { schemaVersion: 1, description: '公式画像の候補。初期衣装確定を意味しません。審査・利用条件確認後に別途採用してください。', checkedAt: new Date().toISOString(), livers: [] };
let blocked = false;
for (const liver of livers) {
  const prior = previous.get(liver.id);
  const item = { id: liver.id, name: liver.name, officialProfileUrl: liver.officialProfileUrl, status: 'unreviewed', candidates: [], selection: prior?.selection || null };
  if (blocked) { item.status = 'not-fetched-rate-limit'; result.livers.push(item); continue; }
  try {
    if (!liver.officialProfileUrl?.startsWith(base)) throw new Error('公式プロフィールURL不正');
    const data = nextData(await fetchProfile(liver.officialProfileUrl));
    if (!data || data.name !== liver.name) throw new Error('ライバー名が公式ページと一致しません');
    const extracted = collectImages(data);
    const byUrl = new Map();
    for (const x of extracted) if (!byUrl.has(x.imageUrl)) byUrl.set(x.imageUrl,x);
    item.candidates = [...byUrl.values()].map((x,i) => ({ index: i + 1, ...x }));
    item.status = item.candidates.length ? 'needs-manual-outfit-verification' : 'no-images-found';
  } catch (e) {
    item.status = 'error';
    item.error = String(e.message || e);
    if (/アクセス制限/.test(item.error)) blocked = true;
  }
  result.livers.push(item);
  if (result.livers.length % 10 === 0) console.log(`${result.livers.length}/${livers.length} の公式ページを処理`);
}
fs.mkdirSync(path.dirname(dest), { recursive:true });
fs.writeFileSync(dest, JSON.stringify(result, null, 2) + '\n');
console.log(`完了: ${result.livers.length}人 / 候補あり ${result.livers.filter(x=>x.candidates.length).length}人 / 要確認 ${result.livers.filter(x=>x.status!=='needs-manual-outfit-verification').length}人`);
console.log(`保存先: ${dest}。※未審査画像を初期衣装としてサイトに自動反映しません。`);
