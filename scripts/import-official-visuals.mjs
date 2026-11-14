/**
 * NIJISANJI official-image visual candidate importer.
 * Usage: node scripts/import-official-visuals.mjs [--apply]
 * No changes in default preview mode. Modifies only public/data/livers/*.json
 * when --apply is supplied. Never overwrites existing IDs or user-curated visuals.
 */
import fs from 'node:fs';
import path from 'node:path';

const apply = process.argv.includes('--apply');
const sourcePath = 'public/data/initial-outfit-review.json';
const liverDir = 'public/data/livers';
const reportPath = 'public/data/visual-import-report.json';
const officialPattern = /^https:\/\/images\.microcms-assets\.io\//;
const profilePattern = /^https:\/\/www\.nijisanji\.jp\/talents\/l\//;
const pattern = /^images\.(variation|threeDVariation)\.(\d+)\.(fullbody|head)\.url$/;

function die(message) { throw new Error(`[公式ビジュアル取り込み] ${message}`); }
const load = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
if (!fs.existsSync(sourcePath)) die(`${sourcePath} が見つかりません`);
if (!fs.existsSync(liverDir)) die(`${liverDir} が見つかりません`);
const review = load(sourcePath);
if (!Array.isArray(review.livers) || review.livers.length === 0) die('候補ファイルにライバー情報がありません');

const listing = fs.readdirSync(liverDir).filter(name => name.endsWith('.json') && !name.startsWith('demo_'));
const byId = new Map();
for (const file of listing) {
  const liver = load(path.join(liverDir, file));
  if (file !== `${liver.id}.json`) die(`個別JSON名とIDの不一致: ${file}`);
  if (byId.has(liver.id)) die(`ライバーID重複: ${liver.id}`);
  byId.set(liver.id, { file, liver });
}

const seen = new Set();
const staged = [];
const report = {
  schemaVersion: 1,
  sourceFile: sourcePath,
  sourceCheckedAt: review.checkedAt ?? null,
  mode: apply ? 'apply' : 'preview',
  note: 'variation/threeDVariationの公式画像を衣装候補として取り込み。初期衣装/新衣装/公開日/お披露目動画を推定しません。ogpは候補として保存のみ。',
  totalLivers: review.livers.length,
  officialVisualGroups: 0,
  importedLiverCount: 0,
  ogpOnlyLiverCount: 0,
  changedFiles: [],
  alreadyImported: 0,
  errors: [],
};

for (const entry of review.livers) {
  if (!entry.id || !entry.name || seen.has(entry.id)) die(`候補IDが空欄または重複: ${entry.id}`);
  seen.add(entry.id);
  const target = byId.get(entry.id);
  if (!target) { report.errors.push(`個別JSONなし: ${entry.name} (${entry.id})`); continue; }
  const { liver, file } = target;
  if (liver.name !== entry.name || liver.officialProfileUrl !== entry.officialProfileUrl) {
    report.errors.push(`ID・名前・公式URL不一致: ${entry.name}`);
    continue;
  }
  if (!profilePattern.test(entry.officialProfileUrl)) {
    report.errors.push(`公式プロフィールURL形式不正: ${entry.name}`);
    continue;
  }
  if (!Array.isArray(liver.visuals)) { report.errors.push(`visuals配列がありません: ${entry.name}`); continue; }
  if (!Array.isArray(entry.candidates)) { report.errors.push(`候補配列がありません: ${entry.name}`); continue; }
  const groups = new Map();
  for (const candidate of entry.candidates) {
    if (!officialPattern.test(candidate.imageUrl || '')) {report.errors.push(`画像URLが不正: ${entry.name} / ${candidate.path}`); continue;}
    const match = pattern.exec(candidate.path || '');
    if (!match) continue; // ogp is a face/OG image, not verified clothing
    const [, group, no, role] = match;
    const id = `${group}:${Number(no)}`;
    const g = groups.get(id) || { group, no:Number(no), fullbody:null, head:null };
    if (g[role]) { report.errors.push(`同じ画像役割が重複: ${entry.name} / ${id}`); continue; }
    g[role] = candidate.imageUrl;
    groups.set(id, g);
  }
  if (groups.size === 0) report.ogpOnlyLiverCount++;
  let changed = false;
  const sorted = [...groups.values()].sort((a,b) => a.group.localeCompare(b.group) || a.no-b.no);
  for (const g of sorted) {
    const category = g.group === 'threeDVariation' ? '3D' : '2D';
    const id = `official-candidate-${category.toLowerCase()}-${g.no}`;
    const imageUrl = g.fullbody || g.head;
    if (!imageUrl) continue;
    report.officialVisualGroups++;
    const variants = [
      ...(g.fullbody ? [{id:`${id}-full`,name:'全身',date:null,imageUrl:g.fullbody}] : []),
      ...(g.head ? [{id:`${id}-face`,name:'顔アップ',date:null,imageUrl:g.head}] : []),
    ];
    const visual = {
      id,
      title:`公式掲載衣装候補 ${g.no+1}`,
      category,
      kind: '衣装候補（初期衣装・新衣装・公開日未確認）',
      date: null,
      imageUrl,
      revealUrl: null,
      variants,
      sources: [{label:'にじさんじ公式プロフィール',url:entry.officialProfileUrl,verifiedAt:review.checkedAt}],
      verification: 'candidate',
      sourcePath:`images.${g.group}.${g.no}`,
    };
    const i = liver.visuals.findIndex(v=>v.id===id);
    if (i >= 0) {
      // Preserve any previously curated edits, including dates and titles.
      report.alreadyImported++;
    } else if (liver.visuals.some(v => v.imageUrl === imageUrl)) {
      // Avoid duplicating manually curated entries with another ID.
      report.alreadyImported++;
    } else {
      liver.visuals.push(visual);
      changed = true;
    }
  }
  if (changed) { staged.push({file, liver}); report.changedFiles.push(file); }
}

// Validate all candidates before writing a single liver file.
if (report.errors.length) {
  console.error(report.errors.slice(0,30).join('\n'));
  die(`${report.errors.length}件の不一致があるため書き込みを中止しました`);
}
report.importedLiverCount = staged.length;
if (apply) {
  // Atomic temp-file replacement, separate per liver, only once all entries passed validation.
  for (const {file,liver} of staged) {
    const target = path.join(liverDir,file);
    const temp = `${target}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(liver,null,2)+'\n');
    fs.renameSync(temp,target);
  }
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
}
console.log(`対象 ${report.totalLivers}人 / 2D・3D衣装候補 ${report.officialVisualGroups}組 / 画像候補のみ ${report.ogpOnlyLiverCount}人`);
console.log(`${apply?'追加した':'追加可能な'}個別JSON ${staged.length}人 / 既存候補 ${report.alreadyImported}組`);
console.log(apply ? `保存完了。続けて npm run build:index と npm run validate:data を実行してください。` : `まだファイルは変更していません。適用する場合は --apply を指定してください。`);
