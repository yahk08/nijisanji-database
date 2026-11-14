import fs from 'node:fs';
const list = JSON.parse(fs.readFileSync('public/data/roster-candidates.json', 'utf8'));
const index = JSON.parse(fs.readFileSync('public/data/generated/index.json', 'utf8'));
const errors = [];
const names = new Set();
for (const item of list.candidates || []) {
  if (!item.name?.trim()) errors.push('候補名が空欄です');
  if (names.has(item.name)) errors.push(`候補名重複: ${item.name}`);
  names.add(item.name);
  if (!['verified', 'needs-profile-verification'].includes(item.status)) errors.push(`状態不正: ${item.name}`);
}
for (const talent of index.livers || []) {
  if (!names.has(talent.name)) errors.push(`一覧に存在しないライバー: ${talent.name}`);
  if (!/^https:\/\/www\.nijisanji\.jp\/talents\/l\//.test(talent.officialProfileUrl)) errors.push(`公式個別プロフィールURL不正: ${talent.name}`);
  const candidate = list.candidates.find(item => item.name === talent.name);
  if (candidate?.status !== 'verified') errors.push(`照合済み表示が不一致: ${talent.name}`);
}
if (list.candidates.filter(x => x.status === 'verified').length !== index.livers.length) errors.push('照合済み件数が個別プロフィール件数と異なります');
console.log(`公式一覧候補: ${names.size}人 / 個別プロフィール確認済み: ${index.livers.length}人 / 要確認: ${names.size-index.livers.length}人`);
if (errors.length) { for (const error of errors) console.error(error); process.exit(1); }
