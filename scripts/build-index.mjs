import fs from 'node:fs';
import path from 'node:path';

const sourceDir = 'public/data/livers';
const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.json') && !f.startsWith('demo_')).sort();
const livers = files.map(f => JSON.parse(fs.readFileSync(path.join(sourceDir, f), 'utf8')));
const portraitPath = 'public/data/portrait-sources.json';
let appliedPortraits = 0;
if (fs.existsSync(portraitPath)) {
  const { portraits } = JSON.parse(fs.readFileSync(portraitPath, 'utf8'));
  if (!Array.isArray(portraits)) throw new Error('portrait-sources.json: portraits must be an array');
  const byId = new Map();
  for (const record of portraits) {
    if (!record.id || !record.name || !record.imageUrl || !record.sourceUrl) throw new Error('Invalid portrait record');
    if (byId.has(record.id)) throw new Error(`Duplicate portrait ID: ${record.id}`);
    if (!/^https:\/\/images\.microcms-assets\.io\//.test(record.imageUrl)) throw new Error(`Unexpected image host: ${record.id}`);
    if (!/^https:\/\/www\.nijisanji\.jp\/talents\/l\//.test(record.sourceUrl)) throw new Error(`Unexpected source URL: ${record.id}`);
    byId.set(record.id, record);
  }
  const indexedIds = new Set(livers.map(x => x.id));
  for (const entry of portraits) if (!indexedIds.has(entry.id)) console.warn(`画像補完対象が未登録: ${entry.name} (${entry.id})`);
  for (const liver of livers) {
    const p = byId.get(liver.id);
    if (!p) continue;
    if (p.name !== liver.name) throw new Error(`Portrait name mismatch: ${p.id}`);
    if (liver.officialProfileUrl && p.sourceUrl !== liver.officialProfileUrl) throw new Error(`Portrait source mismatch: ${p.id}`);
    if (!liver.portraitUrl) {
      liver.portraitUrl = p.imageUrl;
      liver.portraitSourceUrl = p.sourceUrl;
      appliedPortraits++;
    }
  }
}
const index = { generatedAt: new Date().toISOString(), demo: false, livers };
fs.mkdirSync('public/data/generated', { recursive: true });
fs.writeFileSync('public/data/generated/index.json', JSON.stringify(index, null, 2) + '\n');
console.log(`一覧を生成: ${livers.length}件 / demo=false / 公式代表画像補完: ${appliedPortraits}件`);
