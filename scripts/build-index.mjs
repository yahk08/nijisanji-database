import fs from 'node:fs';
import path from 'node:path';
const sourceDir = 'public/data/livers';
const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.json') && !f.startsWith('demo_')).sort();
const livers = files.map(f => JSON.parse(fs.readFileSync(path.join(sourceDir, f), 'utf8')));
const demo = false; // デモJSONは公開データ生成から除外する
const index = { generatedAt: new Date().toISOString(), demo, livers };
fs.mkdirSync('public/data/generated', { recursive: true });
fs.writeFileSync('public/data/generated/index.json', JSON.stringify(index, null, 2) + '\n');
console.log(`一覧を生成: ${livers.length}件 / demo=${demo}`);
