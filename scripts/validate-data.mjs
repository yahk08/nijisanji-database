import fs from 'node:fs';
const path = 'public/data/generated/index.json';
let data;
try { data = JSON.parse(fs.readFileSync(path, 'utf8')); } catch (e) { console.error(`重大: ${path} を読み込めません`, e); process.exit(1); }
const errors = [], warnings = [], seen = new Set();
if (!Array.isArray(data.livers)) errors.push('livers は配列である必要があります');
for (const liver of data.livers || []) {
  if (!liver.id || !liver.name || !liver.affiliation || !Object.hasOwn(liver, 'officialProfileUrl')) errors.push(`必須フィールド不足: ${liver.id || '(IDなし)'}`);
  if (seen.has(liver.id)) errors.push(`ID重複: ${liver.id}`);
  seen.add(liver.id);
  if (!liver.officialProfileUrl && !data.demo) errors.push(`公式プロフィールURL不足: ${liver.id}`);
  for (const f of ['birthday','debutDate','height','fanMark','introduction']) {
    if (!liver[f] || !Object.hasOwn(liver[f], 'value')) warnings.push(`${liver.id}: ${f} が未定義`);
  }
}
for (const liver of data.livers || []) for (const music of liver.music || []) for (const id of music.participantIds || []) {
  if (!seen.has(id)) warnings.push(`${music.id}: 不明な参加者ID ${id}`);
}
console.log(`データ検証: ${errors.length}件の重大エラー / ${warnings.length}件の警告`);
for (const message of errors) console.error('ERROR:', message);
for (const message of warnings) console.warn('WARN:', message);
if (errors.length) process.exit(1);
