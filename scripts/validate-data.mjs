import fs from 'node:fs';
import path from 'node:path';

const indexPath = 'public/data/generated/index.json';
let data;
try {
  data = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
} catch (error) {
  console.error(`重大: ${indexPath} を読み込めません`, error);
  process.exit(1);
}
const errors = [];
const warnings = [];
const seen = new Set();
const unique = { name: new Set(), officialProfileUrl: new Set(), youtubeChannelId: new Set() };
const checks = new Set(['official', 'wiki-only', 'legacy-unreviewed', 'unknown']);
if (!Array.isArray(data.livers)) errors.push('livers は配列である必要があります');
for (const liver of data.livers || []) {
  if (!liver.id || !liver.name || !liver.affiliation || !Object.hasOwn(liver, 'officialProfileUrl'))
    errors.push(`必須フィールド不足: ${liver.id || '(IDなし)'}`);
  if (seen.has(liver.id)) errors.push(`ID重複: ${liver.id}`);
  seen.add(liver.id);
  for (const key of Object.keys(unique)) if (liver[key]) {
    if (unique[key].has(liver[key])) errors.push(`${key}重複: ${liver.id}`);
    unique[key].add(liver[key]);
  }
  if (liver.youtubeChannelId && !/^UC[\w-]{22}$/.test(liver.youtubeChannelId))
    errors.push(`YouTube ID形式: ${liver.id}`);
  if (liver.youtubeChannelId && liver.youtubeChannelUrl?.includes('/channel/') &&
      !liver.youtubeChannelUrl.endsWith('/' + liver.youtubeChannelId))
    errors.push(`YouTube URL/ID不一致: ${liver.id}`);
  for (const key of ['officialProfileUrl', 'youtubeChannelUrl', 'xUrl']) if (liver[key]) {
    try { if (new URL(liver[key]).protocol !== 'https:') throw Error(); }
    catch { errors.push(`URL形式: ${liver.id}/${key}`); }
  }
  const groups = liver.fields?.flatMap(g => g.items.map(i => i.data)) || [];
  for (const field of [...['birthday', 'debutDate', 'height', 'fanMark', 'introduction'].map(k => liver[k]), ...groups]) {
    if (!field) continue;
    if (field.verification && !checks.has(field.verification)) errors.push(`確認度不正: ${liver.id}`);
    if (['official', 'wiki-only'].includes(field.verification) && (!field.sources?.length || field.value == null))
      errors.push(`確認済み値/出典不足: ${liver.id}`);
    if (field.verification === 'wiki-only' && !field.sources?.some(s => new URL(s.url).hostname === 'wikiwiki.jp'))
      errors.push(`Wiki出典不足: ${liver.id}`);
    for (const source of field.sources || []) if (!/^https:\/\//.test(source.url))
      errors.push(`出典URL不正: ${liver.id}`);
  }
  if (liver.debutDate?.value && !/^\d{4}-\d{2}-\d{2}$/.test(liver.debutDate.value))
    errors.push(`デビュー日形式: ${liver.id}`);
  if (new Set(liver.changes.map(c => c.id)).size !== liver.changes.length)
    errors.push(`変更履歴ID重複: ${liver.id}`);
  if (!liver.officialProfileUrl && !data.demo) errors.push(`公式プロフィールURL不足: ${liver.id}`);
  for (const f of ['birthday', 'debutDate', 'height', 'fanMark', 'introduction'])
    if (!liver[f] || !Object.hasOwn(liver[f], 'value')) warnings.push(`${liver.id}: ${f} が未定義`);
}
if (fs.existsSync('public/data/identity-baseline.json')) {
  const baseline = JSON.parse(fs.readFileSync('public/data/identity-baseline.json', 'utf8'));
  for (const prior of baseline.livers) {
    const current = data.livers.find(x => x.id === prior.id);
    if (!current) errors.push(`既存ID欠落: ${prior.id}`);
    else if (current.officialProfileUrl !== prior.officialProfileUrl)
      errors.push(`既存ID/プロフィール対応変更: ${prior.id}`);
  }
}

// The generated index enriches source JSON with portraits. Compare against
// exactly that enrichment, rather than comparing against un-enriched files.
const sourceDir = 'public/data/livers';
const sourceFiles = fs.readdirSync(sourceDir)
  .filter(f => f.endsWith('.json') && !f.startsWith('demo_'));
if (sourceFiles.length !== data.livers.length) errors.push('個別JSONと一覧の件数不一致');
const portraitPath = 'public/data/portrait-sources.json';
const portraitsById = new Map();
if (fs.existsSync(portraitPath)) {
  const payload = JSON.parse(fs.readFileSync(portraitPath, 'utf8'));
  if (!Array.isArray(payload.portraits)) errors.push('代表画像データの配列形式が不正');
  else for (const entry of payload.portraits) {
    if (portraitsById.has(entry.id)) errors.push(`代表画像ID重複: ${entry.id}`);
    portraitsById.set(entry.id, entry);
  }
}
for (const file of sourceFiles) {
  const raw = JSON.parse(fs.readFileSync(path.join(sourceDir, file), 'utf8'));
  if (file !== raw.id + '.json') errors.push(`ファイル名/ID不一致: ${file}`);
  const published = data.livers.find(l => l.id === raw.id);
  if (!published) {
    errors.push(`生成一覧にライバー不在: ${file}`);
    continue;
  }
  // JSON.parse roundtrip removes any accidental references and matches
  // build-index.mjs's portrait enrichment without touching original JSON.
  const expected = structuredClone(raw);
  const portrait = portraitsById.get(raw.id);
  if (portrait) {
    if (portrait.name !== raw.name || portrait.sourceUrl !== raw.officialProfileUrl)
      errors.push(`代表画像の名前・公式出典不一致: ${file}`);
    if (!expected.portraitUrl) {
      expected.portraitUrl = portrait.imageUrl;
      expected.portraitSourceUrl = portrait.sourceUrl;
    }
  }
  if (JSON.stringify(expected) !== JSON.stringify(published))
    errors.push(`生成一覧と個別JSONの不一致: ${file}`);
}
for (const liver of data.livers || []) for (const music of liver.music || [])
  for (const id of music.participantIds || [])
    if (!seen.has(id)) warnings.push(`${music.id}: 不明な参加者ID ${id}`);
console.log(`データ検証: ${errors.length}件の重大エラー / ${warnings.length}件の警告`);
for (const message of errors) console.error('ERROR:', message);
for (const message of warnings) console.warn('WARN:', message);
if (errors.length) process.exit(1);
