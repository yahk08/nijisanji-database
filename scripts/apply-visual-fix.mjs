import {readFileSync,writeFileSync} from 'node:fs';
let app=readFileSync('src/App.tsx','utf8');
let css=readFileSync('src/styles.css','utf8');
function replace(source,a,b,label){if(source.includes(b))return source;if(!source.includes(a))throw Error('コードが一致しないため中止: '+label);return source.replace(a,b)}
try{
const state=`  const [visualCategoryFilter,setVisualCategoryFilter]=useState<'all'|'initial'|'new'|'other'|'unknown'>('all');
  const [visualCategories,setVisualCategories]=useState<Record<string,'initial'|'new'|'other'>>(()=>{try{return JSON.parse(localStorage.getItem('niji-visual-categories')||'{}')}catch{return {}}});
  const categoryKey=(v:Visual)=>\`\${liver?.id||'unknown'}:\${v.id}\`;
  const categoryLabel=(v:Visual)=>({initial:v.category==='3D'?'初期3D':'初期衣装',new:v.category==='3D'?'新3D':'新衣装',other:'その他'} as Record<string,string>)[visualCategories[categoryKey(v)]]||'未分類';
  const classifyVisual=(v:Visual,k:'initial'|'new'|'other'|'unknown')=>setVisualCategories(prev=>{const next={...prev};if(k==='unknown')delete next[categoryKey(v)];else next[categoryKey(v)]=k;return next;});
  const exportVisualCategories=()=>{const entries=Object.entries(visualCategories).map(([key,category])=>({liverId:key.slice(0,key.lastIndexOf(':')),visualId:key.slice(key.lastIndexOf(':')+1),category}));const blob=new Blob([JSON.stringify({schemaVersion:1,entries},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='visual-classifications.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
`;
app=replace(app,"  const [visualFilter,setVisualFilter]=useState<'all'|'2D'|'3D'>('all');", "  const [visualFilter,setVisualFilter]=useState<'all'|'2D'|'3D'>('all');\n"+state,'状態');
app=replace(app,"  useEffect(()=>{try{localStorage.setItem('niji-db-favorites',JSON.stringify(favoriteIds))}catch{}},[favoriteIds]);", "  useEffect(()=>{try{localStorage.setItem('niji-db-favorites',JSON.stringify(favoriteIds))}catch{}},[favoriteIds]);\n  useEffect(()=>{try{localStorage.setItem('niji-visual-categories',JSON.stringify(visualCategories))}catch{}},[visualCategories]);",'保存');
app=replace(app,'<h3>{visualDetail.title}</h3><p className="muted">{visualDetail.category} · {visualDetail.kind} · {formatDate(visualDetail.date)}</p><h4>衣装差分</h4>',`<h3>{visualDetail.title}</h3><p className="muted">{visualDetail.category} · {categoryLabel(visualDetail)} · {formatDate(visualDetail.date)}</p><div className="visual-classify"><strong>衣装の種類を選択</strong><p className="muted">正式な分類は自動判定していません。画像を確認して選んでください。</p><div className="visual-classify-buttons">{([{id:'initial',label:visualDetail.category==='3D'?'初期3D':'初期衣装'},{id:'new',label:visualDetail.category==='3D'?'新3D':'新衣装'},{id:'other',label:'その他'},{id:'unknown',label:'未分類'}] as const).map(o=><button key={o.id} className={(visualCategories[categoryKey(visualDetail)]||'unknown')===o.id?'active':''} onClick={()=>classifyVisual(visualDetail,o.id)}>{o.label}</button>)}</div></div><h4>衣装差分</h4>`,'衣装編集');
app=replace(app,'<small>{formatDate(v.date)} · {v.category}</small></button>)','<small>{formatDate(v.date)} · {v.category} · {categoryLabel(v)}</small></button>)','一覧ラベル');
app=replace(app,`</div><div className="visual-grid">{liver.visuals.filter(v=>visualFilter==='all'||v.category===visualFilter).sort`, `</div><div className="visual-review-options"><label>分類で絞り込む <select value={visualCategoryFilter} onChange={e=>setVisualCategoryFilter(e.target.value as typeof visualCategoryFilter)}><option value="all">すべて</option><option value="initial">初期衣装</option><option value="new">新衣装</option><option value="other">その他</option><option value="unknown">未分類</option></select></label><button onClick={exportVisualCategories}>分類結果をJSONで保存</button></div><div className="visual-grid">{liver.visuals.filter(v=>(visualFilter==='all'||v.category===visualFilter)&&(visualCategoryFilter==='all'||(visualCategories[categoryKey(v)]||'unknown')===visualCategoryFilter)).sort`,'絞り込み');
app=replace(app,"liver.visuals.filter(v=>visualFilter==='all'||v.category===visualFilter).length===0", "liver.visuals.filter(v=>(visualFilter==='all'||v.category===visualFilter)&&(visualCategoryFilter==='all'||(visualCategories[categoryKey(v)]||'unknown')===visualCategoryFilter)).length===0",'0件表示');
css=replace(css,'.visual-card>div{height:160px}', '.visual-card>div{height:230px}', '一覧高さ');
css=replace(css,'.visual-large{position:relative;height:330px;', '.visual-large{position:relative;height:min(70vh,620px);min-height:360px;', '詳細高さ');
const extra=`\n/* Visual gallery: show the complete artwork rather than cropping it. */
.visual-card .media-visual,.visual-large .media-visual,.variant-grid .media-visual{object-fit:contain;object-position:center;background:var(--surface-alt)}
.visual-classify{padding:14px;background:var(--surface-alt);border:1px solid var(--line);border-radius:12px;margin:15px 0}
.visual-classify strong{font-size:13px}.visual-classify p{margin:7px 0 12px}.visual-classify-buttons{display:flex;gap:7px;flex-wrap:wrap}
.visual-classify-buttons button{background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:9px 11px;color:var(--ink);font-size:12px}
.visual-classify-buttons button.active{background:var(--soft);border-color:var(--primary);color:var(--primary);font-weight:800}
.visual-review-options{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0 15px}
.visual-review-options label{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted)}
.visual-review-options select,.visual-review-options button{background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:9px;padding:9px;font-size:12px}
`;
if(!css.includes('/* Visual gallery: show the complete artwork'))css+=extra;
writeFileSync('src/App.tsx',app);writeFileSync('src/styles.css',css);
console.log('完了: 全身表示と分類機能を追加しました。');
}catch(e){console.error(e.message);process.exitCode=1}
