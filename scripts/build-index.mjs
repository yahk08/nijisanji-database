import fs from 'node:fs';
import path from 'node:path';

const sourceDir = 'public/data/livers';
const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.json') && !f.startsWith('demo_')).sort();
const livers = files.map(f => JSON.parse(fs.readFileSync(path.join(sourceDir, f), 'utf8')));

// Registered portrait URLs are added to the generated index, without changing liver JSON.
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

// This roster is an older discovery snapshot. It may say "needs verification" for
// profiles which have already been collected. Keep it synchronized with real JSON.
// Never silently claim verification unless the official profile URL agrees.
const rosterPath = 'public/data/roster-candidates.json';
let synchronized = 0;
if (fs.existsSync(rosterPath)) {
  const roster = JSON.parse(fs.readFileSync(rosterPath, 'utf8'));
  if (!Array.isArray(roster.candidates)) throw new Error('roster-candidates.json: candidates must be an array');
  const byName = new Map();
  for (const entry of roster.candidates) {
    if (!entry.name || byName.has(entry.name)) throw new Error(`Roster name missing or duplicated: ${entry.name}`);
    byName.set(entry.name, entry);
  }
  const seen = new Set();
  for (const liver of livers) {
    if (seen.has(liver.name)) throw new Error(`Duplicate liver name: ${liver.name}`);
    seen.add(liver.name);
    const candidate = byName.get(liver.name);
    if (!candidate) throw new Error(`Roster candidate not found: ${liver.name}`);
    if (!/^https:\/\/www\.nijisanji\.jp\/talents\/l\//.test(liver.officialProfileUrl || '')) {
      throw new Error(`Official profile missing or malformed: ${liver.name}`);
    }
    const prior = candidate.officialProfileUrl || candidate.profileUrl;
    if (prior && prior !== liver.officialProfileUrl) {
      throw new Error(`Official profile mismatch for ${liver.name}: ${prior}`);
    }
    if (candidate.liverId && candidate.liverId !== liver.id) {
      throw new Error(`Existing candidate ID mismatch: ${liver.name}`);
    }
    if (candidate.status !== 'verified' || candidate.liverId !== liver.id || candidate.officialProfileUrl !== liver.officialProfileUrl) {
      synchronized++;
    }
    candidate.status = 'verified';
    candidate.liverId = liver.id;
    candidate.officialProfileUrl = liver.officialProfileUrl;
    // Preserve existing verifiedAt; do not fabricate a new verification date.
    if (!candidate.verifiedAt && liver.provenance?.checkedAt) candidate.verifiedAt = liver.provenance.checkedAt;
  }
  // Never demote or drop entries; the existing validator will catch extra verified
  // candidates or missing profiles rather than hiding them.
  fs.writeFileSync(rosterPath, JSON.stringify(roster, null, 2) + '\n');
}

const aliasesFile='public/data/liver-id-aliases.json';
const idAliases=fs.existsSync(aliasesFile)?JSON.parse(fs.readFileSync(aliasesFile,'utf8')).aliases:{};
const index = { generatedAt: new Date().toISOString(), demo: false, idAliases, livers };
fs.mkdirSync('public/data/generated', { recursive: true });
fs.writeFileSync('public/data/generated/index.json', JSON.stringify(index, null, 2) + '\n');
console.log(`一覧を生成: ${livers.length}件 / demo=false / 公式代表画像補完: ${appliedPortraits}件 / 候補一覧を同期: ${synchronized}件`);
