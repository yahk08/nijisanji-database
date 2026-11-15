import fs from 'node:fs';
const file='src/App.tsx';
if(!fs.existsSync(file)) throw Error('src/App.tsx がありません。プロジェクトのルートで実行してください。');
let app=fs.readFileSync(file,'utf8');
const anchor="  const [dataset,setDataset]=useState<LiverIndex|null>(null);";
const news='<section className="section"><div className="section-heading"><h2>公式ニュース・お知らせ</h2></div><div className="empty-small">ニュースは現在未収集です。確認できていない記事は表示しません。</div></section>';
const event='<section className="section"><div className="section-heading"><h2>イベント・ライブ</h2></div><div className="empty-small">公式イベントは現在未収集です。開催予定を推測して表示しません。</div></section>';
if(app.includes('const [officialNews,setOfficialNews]')){console.log('すでに追加済みです。');process.exit(0);}
for(const a of [anchor,news,event])if(app.split(a).length!==2)throw Error('既存コードが想定と異なります。安全のため変更していません。');
const state=`  const [officialNews,setOfficialNews]=useState<{checkedAt:string|null;news:{id:string;title:string;url:string;publishedAt:string|null;category:'news'|'event'}[]}|null>(null);
  useEffect(()=>{fetch(\`\${ASSET_BASE}data/official-news.json\`,{cache:'no-cache'}).then(r=>r.ok?r.json():Promise.reject()).then(d=>{if(d.schemaVersion===1&&Array.isArray(d.news))setOfficialNews(d);}).catch(()=>{});},[]);`;
app=app.replace(anchor,anchor+'\n'+state);
const display=(kind)=>`<section className="section"><div className="section-heading"><h2>${kind==='news'?'公式ニュース・お知らせ':'イベント・ライブ'}</h2></div>{officialNews?.news?.some(n=>n.category==='${kind}')?<><p className="small-hint">${kind==='event'?'イベント関連の公式告知。日付は開催日ではなく掲載日です。':'公式ニュースから取得した情報です。'}</p><div className="news-feed">{officialNews.news.filter(n=>n.category==='${kind}').slice(0,8).map(n=><a className="news-feed-row" key={n.id} href={n.url} target="_blank" rel="noopener noreferrer"><small>掲載：{formatDate(n.publishedAt)}</small><strong>{n.title}</strong><ExternalLink size={15}/></a>)}</div></>:<div className="empty-small">まだ情報が取得されていません。</div>}</section>`;
app=app.replace(news,display('news')).replace(event,display('event'));
fs.writeFileSync(file,app);
const css='src/styles.css';if(!fs.readFileSync(css,'utf8').includes('.news-feed-row')) fs.appendFileSync(css,'\n.news-feed{display:flex;flex-direction:column;gap:9px}.news-feed-row{display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:13px;color:var(--ink)}.news-feed-row small{font-size:11px;color:var(--muted);white-space:nowrap}.news-feed-row strong{font-size:12px;line-height:1.6;flex:1}.news-feed-row svg{flex-shrink:0;color:var(--primary)}@media(max-width:600px){.news-feed-row{flex-wrap:wrap}.news-feed-row small{width:100%}}\n');
console.log('ホーム画面へのニュース・イベント表示を追加しました。');
const workflow='.github/workflows/pages.yml';
if(fs.existsSync(workflow)){
  let yaml=fs.readFileSync(workflow,'utf8');
  if(!yaml.includes('workflows: ["Collect official NIJISANJI news"]')){
    const marker='permissions:\n';
    if(yaml.split(marker).length!==2)throw Error('pages.yml の更新箇所が見つかりません。');
    yaml=yaml.replace(marker,`  workflow_run:\n    workflows: ["Collect official NIJISANJI news"]\n    types: [completed]\n${marker}`);
    yaml=yaml.replace('  build:\n    runs-on:',`  build:\n    if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'\n    runs-on:`);
    fs.writeFileSync(workflow,yaml);
    console.log('ニュース収集成功後の公開処理も連動しました。');
  }
}
