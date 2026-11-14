import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Cake, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ExternalLink, Heart, Home, Image as ImageIcon, Info, Layers3, List, Menu, Moon, Music2, Play, Search, Settings, Sun, Users, Youtube } from 'lucide-react';
import type { Event, FieldValue, Liver, LiverIndex, Music, Video, Visual } from './types';

type Page = 'home' | 'livers' | 'profile' | 'settings';
type Tab = 'profile' | 'visual' | 'music' | 'history';
const ASSET_BASE = import.meta.env.BASE_URL;
const formatDate = (v: string | null | undefined) => v ? (v.match(/^\d{4}-\d{2}-\d{2}$/) ? v.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1/$2/$3') : v) : '未登録';
const formatBirthday = (v: string | null) => v && /^\d\d-\d\d$/.test(v) ? `${Number(v.slice(0, 2))}月${Number(v.slice(3))}日` : (v || '未登録');
const validHttp = (url: string | null | undefined) => !!url && /^https:\/\//.test(url);
const videoLabels: Record<Video['status'],string> = { live:'配信中',upcoming:'配信予定',archive:'アーカイブ',video:'動画',short:'Shorts' };
const musicLabels: Record<Music['category'],string> = {original:'オリジナル曲',cover:'歌ってみた',participation:'参加楽曲'};
const eventLabels: Record<string,string> = {visual:'ビジュアル',music:'音楽',event:'イベント',milestone:'記念・達成',other:'その他'};
const str = (v: string | null | undefined) => v || '未登録';

function Placeholder({ kind='portrait' }: {kind?:'portrait'|'video'|'visual'}) {
  return <div className={`placeholder placeholder-${kind}`}><span>{kind==='video'?<Play size={28}/>:kind==='visual'?<ImageIcon size={36}/>:<Users size={38}/>}</span><small>{kind==='video'?'サムネイル未登録':kind==='visual'?'画像未登録':'立ち絵未登録'}</small></div>;
}
function Img({src,kind='portrait',alt=''}: {src?:string|null;kind?:'portrait'|'video'|'visual';alt?:string}) {
  return validHttp(src) ? <img className={`media media-${kind}`} src={src!} alt={alt} loading="lazy" onError={e=>{e.currentTarget.style.display='none';}}/> : <Placeholder kind={kind}/>;
}
function ButtonLink({href,children}:{href?:string|null;children:ReactNode}) {
  return validHttp(href) ? <a className="outline-button" href={href!} target="_blank" rel="noopener noreferrer">{children}<ExternalLink size={15}/></a> : null;
}
function displayField(f:FieldValue, birthday=false) {return birthday?formatBirthday(f.value):str(f.value);}
function formatTime(iso:string|null|undefined) {if (!iso) return '未取得'; const date=new Date(iso);return Number.isNaN(date.getTime())?'未取得':new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(date);}
function dateSort(a:string|null|undefined,b:string|null|undefined,ascending:boolean) {if(!a&&!b)return 0;if(!a) return 1;if(!b)return -1;return ascending?a.localeCompare(b):b.localeCompare(a);}
function routeFor(page:Page, id?:string) {return page==='profile'&&id?`#/liver/${id}`:`#/${page}`;}
function readRoute() {const match=location.hash.match(/^#\/liver\/([\w-]+)$/); return match?{page:'profile' as Page,id:match[1]}:{page:(['home','livers','settings'].includes(location.hash.slice(2))?location.hash.slice(2):'home') as Page,id:null};}

export default function App() {
  const [dataset,setDataset]=useState<LiverIndex|null>(null);
  const [loadError,setLoadError]=useState('');
  const [roster,setRoster]=useState<{name:string;status:string}[]>([]);
  const [favoriteIds,setFavoriteIds]=useState<string[]>(()=>{try{return JSON.parse(localStorage.getItem('niji-db-favorites')||'[]')}catch{return []}});
  const [randomOrder,setRandomOrder]=useState<string[]>([]);
  const [candidateLimit,setCandidateLimit]=useState(20);
  const [theme,setTheme]=useState<'light'|'dark'|'system'>(()=>{try{const saved=localStorage.getItem('niji-db-theme');return saved==='light'||saved==='dark'||saved==='system'?saved:'system'}catch{return 'system'}});
  const [systemDark,setSystemDark]=useState(()=>typeof window!=='undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const dark=theme==='system'?systemDark:theme==='dark';
  const [route,setRoute]=useState(readRoute);
  const [search,setSearch]=useState('');
  const [branch,setBranch]=useState('all');
  const [year,setYear]=useState('all');
  const [sort,setSort]=useState<'debut-asc'|'debut-desc'|'name-asc'|'name-desc'|'random'>('debut-asc');
  const [listScroll,setListScroll]=useState(0);
  const [layout,setLayout]=useState<'cards'|'list'>('cards');
  const [tab,setTab]=useState<Tab>('visual');
  const [expanded,setExpanded]=useState<string[]>(['ファン・配信情報']);
  const [sourceField,setSourceField]=useState<{title:string,field:FieldValue}|null>(null);
  const [visualFilter,setVisualFilter]=useState<'all'|'2D'|'3D'>('all');
  const [visualDetail,setVisualDetail]=useState<Visual|null>(null);
  const [variantIdx,setVariantIdx]=useState(0);
  const [musicCategory,setMusicCategory]=useState<'original'|'cover'|'participation'>('original');
  const [musicNewest,setMusicNewest]=useState(false);
  const [musicDetail,setMusicDetail]=useState<Music|null>(null);
  const [videoExpand,setVideoExpand]=useState(false);
  const [historyYear,setHistoryYear]=useState('all');
  const [historyCategory,setHistoryCategory]=useState('all');
  const [historyNewest,setHistoryNewest]=useState(true);
  const [eventDetail,setEventDetail]=useState<Event|null>(null);
  const go=(page:Page,id?:string)=>{if(page==='profile'&&route.page==='livers')setListScroll(window.scrollY);location.hash=routeFor(page,id);if(page==='profile'){setTab('visual');setVisualDetail(null);setMusicDetail(null);setEventDetail(null);setVideoExpand(false);}window.scrollTo({top:0,behavior:'instant'});};
  useEffect(()=>{const listen=()=>setRoute(readRoute());window.addEventListener('hashchange',listen);return()=>window.removeEventListener('hashchange',listen)},[]);
  useEffect(()=>{fetch(`${ASSET_BASE}data/roster-candidates.json`,{cache:'no-cache'}).then(r=>r.ok?r.json():Promise.reject()).then(data=>setRoster(Array.isArray(data.candidates)?data.candidates:[])).catch(()=>{});},[]);
  useEffect(()=>{try{localStorage.setItem('niji-db-favorites',JSON.stringify(favoriteIds))}catch{}},[favoriteIds]);
  useEffect(()=>{const media=window.matchMedia('(prefers-color-scheme: dark)');const update=()=>setSystemDark(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';try{localStorage.setItem('niji-db-theme',theme)}catch{/* private mode */}},[theme,dark]);
  useEffect(()=>{
    let live=true;
    const key='niji-db-list-v2';
    try {const cache=localStorage.getItem(key);if(cache){const parsed=JSON.parse(cache) as LiverIndex;if(live)setDataset(parsed);}} catch {/* ignore cache errors */}
    fetch(`${ASSET_BASE}data/generated/index.json`,{cache:'no-cache'}).then(async r=>{if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json() as Promise<LiverIndex>}).then(data=>{
      if(!Array.isArray(data.livers)) throw Error('データの形式が不正です');if(live){setDataset(data);setLoadError('');}
      try{localStorage.setItem(key,JSON.stringify(data))}catch{/* quota */}
    }).catch(()=>{if(live)setLoadError('最新データを取得できませんでした。保存済みの情報があれば表示しています。')});
    return()=>{live=false};
  },[]);
  const livers=useMemo(()=>dataset?.livers.filter(l=>l.status==='active')||[],[dataset]);
  const liver=livers.find(l=>l.id===route.id);
  const branches=Array.from(new Set(livers.map(l=>l.branch))).sort();
  const years=Array.from(new Set(livers.map(l=>l.debutDate.value?.slice(0,4)).filter((v):v is string=>!!v))).sort();
  const filtered=useMemo(()=>livers.filter(l=>{
    const query=search.trim().toLocaleLowerCase('ja-JP');return(!query || [l.name,l.reading,l.englishName,l.group].some(v=>v?.toLocaleLowerCase('ja-JP').includes(query))) && (branch==='all'||l.branch===branch) && (year==='all'||l.debutDate.value?.startsWith(year));
  }).sort((a,b)=>sort==='random'?(randomOrder.indexOf(a.id)-randomOrder.indexOf(b.id)):sort.startsWith('name')?(sort==='name-asc'?1:-1)*(a.reading||a.name).localeCompare(b.reading||b.name,'ja'):dateSort(a.debutDate.value,b.debutDate.value,sort==='debut-asc')),[livers,search,branch,year,sort,randomOrder]);
  const pendingRoster=roster.filter(item=>item.status!=='verified'&&item.name.includes(search.trim()));
  const toggleFavorite=(id:string)=>setFavoriteIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  const reshuffle=()=>{const next=livers.map(l=>l.id);for(let i=next.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[next[i],next[j]]=[next[j],next[i]];}setRandomOrder(next);};
  const allMusic=useMemo(()=>Array.from(new Map(livers.flatMap(l=>l.music).map(m=>[m.id,m])).values()),[livers]);
  const liverMusic=liver?allMusic.filter(m=>m.participantIds.includes(liver.id)):[];
  const backDetail=()=>{if(visualDetail){setVisualDetail(null)}else if(musicDetail){setMusicDetail(null)}else if(eventDetail){setEventDetail(null)}else{go('livers');requestAnimationFrame(()=>window.scrollTo(0,listScroll))}};
  const demo=dataset?.demo ?? false;
  const renderField=(label:string,field:FieldValue)=>{
    const interactive=!!field.showSources && !!field.sources?.length;
    return <button key={label} className={`field-value ${interactive?'field-clickable':''}`} disabled={!interactive} onClick={()=>setSourceField({title:label,field})}>
      <span>{label}</span><strong>{displayField(field)}</strong>{interactive&&<Info size={13}/>}
    </button>;
  };
  const eventRecords=liver ? [
    ...(liver.debutDate.value?[{id:'debut',date:liver.debutDate.value,title:'デビュー',category:'milestone',target:'profile'}]:[]),
    ...liver.visuals.map(v=>({id:`visual:${v.id}`,date:v.date,title:v.title,category:'visual',target:v.id})),
    ...liverMusic.map(m=>({id:`music:${m.id}`,date:m.date,title:m.title,category:'music',target:m.id})),
    ...liver.events.map(e=>({id:`event:${e.id}`,date:e.date,title:e.title,category:e.category,target:e.id}))
  ]:[];
  const timeline=eventRecords.filter(e=>(historyYear==='all'||e.date?.startsWith(historyYear))&&(historyCategory==='all'||e.category===historyCategory)).sort((a,b)=>dateSort(a.date,b.date,!historyNewest));
  const activityYears=Array.from(new Set(eventRecords.map(e=>e.date?.slice(0,4)).filter((v):v is string=>!!v))).sort().reverse();
  const videos=liver?.youtube.videos.slice().sort((a,b)=>{
    const rank=(v:Video)=>v.status==='live'?0:v.status==='upcoming'?1:2;
    return rank(a)-rank(b) || (a.status==='upcoming'&&b.status==='upcoming'?dateSort(a.scheduledStartAt||null,b.scheduledStartAt||null,true):dateSort(a.publishedAt,b.publishedAt,false));
  }).slice(0,5)||[];
  const switchVariant=(step:number)=>{if(!visualDetail)return;setVariantIdx(v=>(v+step+visualDetail.variants.length)%visualDetail.variants.length)};
  let swipeStart:number|null=null;
  const navItems=[{page:'home' as Page,label:'ホーム',icon:Home},{page:'livers' as Page,label:'ライバー',icon:Users},{page:'settings' as Page,label:'設定',icon:Settings}];
  return <div className="app-shell">
    <header className="topbar"><div className="topbar-inner">
      {route.page==='profile'?<button className="icon-button" aria-label="戻る" onClick={backDetail}><ArrowLeft size={22}/></button>:<div className="brand-mark"><span className="brand-symbol">N</span><div><strong>にじさんじ DB</strong><small>NIJISANJI DATABASE</small></div></div>}
      {route.page==='profile'&&<><strong className="header-name">{liver?.name||'ライバー'}</strong>{liver&&<button className="icon-button" aria-label="お気に入り切替" onClick={()=>toggleFavorite(liver.id)}><Heart fill={favoriteIds.includes(liver.id)?'currentColor':'none'} size={20}/></button>}</>}
      <button className="icon-button" onClick={()=>setTheme(dark?'light':'dark')} aria-label={dark?'ライトモードにする':'ダークモードにする'}>{dark?<Sun size={21}/>:<Moon size={21}/>}</button>
    </div></header>
    <main className="content">
      {demo&&<div className="demo-ribbon"><Info size={15}/> デモ情報が含まれています</div>}
      {loadError&&<div className="notice warning">{loadError}</div>}
      {!dataset&&<div className="empty"><Layers3 size={34}/><h2>データを読み込んでいます</h2><p>初回アクセス時は少し時間がかかることがあります。</p></div>}
      {dataset&&route.page==='home'&&<>
        <section className="section"><div className="section-heading"><h1>にじデータベース</h1></div><p className="muted">公式プロフィール確認済み {livers.length}人 / 公式ストア掲載の照合候補 {roster.length}人。全件確認・自動更新は準備中です。</p>
          <form className="hero-search" onSubmit={e=>{e.preventDefault();go('livers')}}><Search size={20}/><input aria-label="ライバー検索" placeholder="ライバー名・グループ名で検索" value={search} onChange={e=>setSearch(e.target.value)}/><button type="submit" aria-label="検索する"><ArrowRight size={19}/></button></form>
        </section>
        <section className="section"><div className="section-heading"><h2>公式ニュース・お知らせ</h2></div><div className="empty-small">ニュースは現在未収集です。確認できていない記事は表示しません。</div></section>
        <section className="section"><div className="section-heading"><h2>イベント・ライブ</h2></div><div className="empty-small">公式イベントは現在未収集です。開催予定を推測して表示しません。</div></section>
        <section className="section"><div className="section-heading"><h2>最近デビューしたライバー</h2><button className="text-link" onClick={()=>go('livers')}>もっと見る <ChevronRight size={16}/></button></div>
          {livers.length?<div className="birthday-row">{[...livers].sort((a,b)=>dateSort(a.debutDate.value,b.debutDate.value,false)).slice(0,5).map(l=><button key={l.id} className="birthday-card" onClick={()=>go('profile',l.id)}><div className="avatar"><Users size={23}/></div><strong>{l.name}</strong><span>{formatDate(l.debutDate.value)}</span></button>)}</div>:<div className="empty-small">確認済みのデビュー日データはありません。</div>}
        </section>
        <section className="section"><div className="section-heading"><h2>新衣装・3D</h2></div><div className="empty-small">確認済みの衣装・3Dは現在未登録です。</div></section>
        <section className="section"><div className="section-heading"><h2>新曲・歌ってみた</h2></div><div className="empty-small">確認済みの新曲・歌ってみたは現在未登録です。</div></section>
      </>}
      {dataset&&route.page==='livers'&&<>
        <div className="page-heading"><span className="eyebrow">LIVER DIRECTORY</span><h1>ライバー一覧</h1><p>名前やデビュー年からライバーを探せます。</p></div>
        <label className="search-field"><Search size={19}/><input placeholder="ライバー名・グループ名を検索" value={search} onChange={e=>setSearch(e.target.value)}/></label>
        <div className="filter-row"><label>所属<select value={branch} onChange={e=>setBranch(e.target.value)}><option value="all">すべて</option>{branches.map(b=><option key={b} value={b}>{b}</option>)}</select></label><label>デビュー年<select value={year} onChange={e=>setYear(e.target.value)}><option value="all">すべて</option>{years.map(y=><option key={y} value={y}>{y}年</option>)}</select></label></div>
        {favoriteIds.length>0&&<section className="section"><div className="section-heading"><h2>お気に入り</h2></div><div className="birthday-row">{livers.filter(l=>favoriteIds.includes(l.id)).map(l=><button key={l.id} className="birthday-card" onClick={()=>go('profile',l.id)}><div className="avatar"><Heart size={20}/></div><strong>{l.name}</strong></button>)}</div></section>}
        <div className="list-controls"><span>{filtered.length}人を表示</span><div className="toggle"><button className={layout==='cards'?'selected':''} onClick={()=>setLayout('cards')} aria-label="カード表示"><Menu size={18}/></button><button className={layout==='list'?'selected':''} onClick={()=>setLayout('list')} aria-label="リスト表示"><List size={18}/></button></div></div>
        <label className="sort-row">並び順 <select value={sort} onChange={e=>{if(e.target.value==='random'&&!randomOrder.length)reshuffle();setSort(e.target.value as typeof sort)}}><option value="debut-asc">デビューが古い順</option><option value="debut-desc">デビューが新しい順</option><option value="name-asc">名前順（昇順）</option><option value="name-desc">名前順（降順）</option><option value="random">ランダム</option></select></label>{sort==='random'&&<button className="outline-button" onClick={reshuffle}>再シャッフル</button>}
        {filtered.length?layout==='cards'?<div className="liver-cards">{filtered.map(l=><LiverCard key={l.id} liver={l} onClick={()=>go('profile',l.id)}/>)}</div>:<div className="list-stack">{filtered.map(l=><button key={l.id} className="liver-list-row" onClick={()=>go('profile',l.id)}><div className="avatar"><Users size={22}/></div><div><strong>{l.name}</strong><small>{str(l.group)} · {formatDate(l.debutDate.value)} · {str(l.fanMark.value)}</small></div><ChevronRight size={18}/></button>)}</div>:<div className="empty"><Search size={28}/><p>該当するライバーがいません</p><button className="outline-button" onClick={()=>{setSearch('');setBranch('all');setYear('all')}}>条件をリセット</button></div>}
        <section className="section"><div className="section-heading"><h2>公式ストア掲載・個別プロフィール確認中</h2></div>
        <p className="muted">公式ストアの掲載名から作った照合候補です。ここに表示される名前は、現役所属や個別プロフィールURL・デビュー日まで確認済みという意味ではありません。</p>
        <div className="candidate-grid">{pendingRoster.slice(0,candidateLimit).map(c=><div key={c.name} className="candidate-row"><span>{c.name}</span><small>未照合</small></div>)}</div>
        {pendingRoster.length>candidateLimit&&<button className="expand-button" onClick={()=>setCandidateLimit(v=>v+20)}>もっと見る（残り{pendingRoster.length-candidateLimit}人）</button>}
        <a className="outline-button" href="https://shop.nijisanji.jp/search/artist?cgid=nijisanji" target="_blank" rel="noreferrer">公式ストア掲載元を確認 <ExternalLink size={15}/></a></section>
      </>}
      {dataset&&route.page==='profile'&&(liver?<>
        <div className="profile-hero"><div className="portrait"><Img src={liver.portraitUrl} alt={liver.name}/></div><div className="profile-identity"><span className="eyebrow">LIVER PROFILE</span><h1>{liver.name}</h1><p>{str(liver.reading)}</p>{liver.englishName&&<small>{liver.englishName}</small>}<div className="chip-row"><span className="chip">{liver.branch}</span>{liver.group&&<span className="chip">{liver.group}</span>}</div><div className="social-row">{validHttp(liver.youtubeChannelUrl)&&<a href={liver.youtubeChannelUrl!} rel="noopener noreferrer" target="_blank" aria-label="YouTube"><Youtube size={20}/></a>}{validHttp(liver.xUrl)&&<a href={liver.xUrl!} rel="noopener noreferrer" target="_blank" aria-label="X">X</a>}{validHttp(liver.officialProfileUrl)&&<a href={liver.officialProfileUrl} rel="noopener noreferrer" target="_blank" aria-label="公式プロフィール"><ExternalLink size={19}/></a>}</div></div></div>
        <div className="fact-grid">{[{label:'誕生日',value:formatBirthday(liver.birthday.value),icon:Cake,field:liver.birthday},{label:'デビュー日',value:formatDate(liver.debutDate.value),icon:CalendarDays,field:liver.debutDate},{label:'身長',value:str(liver.height.value),icon:Users,field:liver.height},{label:'ファンマーク',value:str(liver.fanMark.value),icon:Heart,field:liver.fanMark}].map(f=><button className="fact" key={f.label} disabled={!f.field.showSources||!f.field.sources?.length} onClick={()=>setSourceField({title:f.label,field:f.field})}><span><f.icon size={16}/>{f.label}</span><strong>{f.value}</strong></button>)}</div>
        <section className="section intro"><div className="section-heading"><h2>ライバー紹介</h2><BookOpen size={19}/></div><p>{str(liver.introduction.value)}</p></section>
        <section className="section youtube-section"><div className="section-heading"><h2><Youtube size={23}/> YouTube最新情報</h2><span className="small-hint">最大5件</span></div><p className="update-hint">動画の最終取得：{formatTime(liver.youtube.fetchedAt)}　/　配信状態の確認：{formatTime(liver.youtube.stateCheckedAt)}</p>
          {!liver.youtube.fetchedAt&&<p className="notice">YouTube APIには未接続です。{demo?'以下は架空の操作デモです。':'最新の配信状況は未確認です。'}</p>}
          {videos.length? <><div className="video-list">{videos.slice(0,videoExpand?5:2).map(v=><div className="video-row" key={v.id}><div className="video-thumb"><Img src={v.thumbnailUrl} kind="video" alt=""/></div><div className="video-body"><strong>{v.title}</strong><div className="meta-line"><span className={`status ${v.status}`}>{videoLabels[v.status]}</span></div><small>{v.status==='upcoming' ? formatTime(v.scheduledStartAt) : formatTime(v.publishedAt)}</small>{validHttp(v.url)&&<a href={v.url!} target="_blank" rel="noopener noreferrer" className="video-go">YouTubeで見る <ExternalLink size={13}/></a>}</div></div>)}</div>{videos.length>2&&<button className="expand-button" onClick={()=>setVideoExpand(v=>!v)}>{videoExpand?'閉じる':`残り${videos.length-2}件を表示`}{videoExpand?<ChevronUp size={18}/>:<ChevronDown size={18}/>}</button>}</>:<div className="empty-small">動画情報は未登録です。</div>}
          <ButtonLink href={liver.youtubeChannelUrl}>公式YouTubeチャンネルを見る</ButtonLink>
        </section>
        <section className="section tabs-section"><div className="tabs" role="tablist" aria-label="ライバー詳細">{([{id:'visual',label:'ビジュアル'},{id:'music',label:'音楽'},{id:'history',label:'活動履歴'}] as const).map(t=><button role="tab" aria-selected={tab===t.id} className={tab===t.id?'active':''} key={t.id} onClick={()=>{setTab(t.id);setVisualDetail(null);setMusicDetail(null);setEventDetail(null);}}>{t.label}</button>)}</div>
          {tab==='visual'&&<div className="tab-content"><h2>ビジュアル</h2>{visualDetail?<><button className="small-back" onClick={()=>setVisualDetail(null)}><ArrowLeft size={17}/> ギャラリーへ戻る</button><div className="visual-large" onTouchStart={e=>{swipeStart=e.changedTouches[0].clientX}} onTouchEnd={e=>{if(swipeStart!==null){const dx=e.changedTouches[0].clientX-swipeStart;if(Math.abs(dx)>45)switchVariant(dx<0?1:-1);swipeStart=null;}}}><Img kind="visual" src={visualDetail.variants[variantIdx]?.imageUrl||visualDetail.imageUrl} alt={visualDetail.title}/>{visualDetail.variants.length>1&&<><button aria-label="前の差分" className="visual-prev" onClick={()=>switchVariant(-1)}><ChevronLeft/></button><button aria-label="次の差分" className="visual-next" onClick={()=>switchVariant(1)}><ChevronRight/></button></>}</div><h3>{visualDetail.title}</h3><p className="muted">{visualDetail.category} · {visualDetail.kind} · {formatDate(visualDetail.date)}</p><h4>衣装差分</h4><div className="variant-grid">{visualDetail.variants.map((v,i)=><button className={variantIdx===i?'active':''} key={v.id} onClick={()=>setVariantIdx(i)}><Img src={v.imageUrl} kind="visual" alt={v.name}/><small>{v.name}</small></button>)}</div><p className="muted">選択中の差分：{visualDetail.variants[variantIdx]?.name} · 公開日 {formatDate(visualDetail.variants[variantIdx]?.date)}</p><ButtonLink href={visualDetail.revealUrl}>お披露目動画を見る</ButtonLink></>:<><div className="filter-pills">{(['all','2D','3D'] as const).map(c=><button key={c} className={visualFilter===c?'active':''} onClick={()=>setVisualFilter(c)}>{c==='all'?'すべて':c}</button>)}</div><div className="visual-grid">{liver.visuals.filter(v=>visualFilter==='all'||v.category===visualFilter).sort((a,b)=>dateSort(a.date,b.date,true)).map(v=><button className="visual-card" key={v.id} onClick={()=>{setVisualDetail(v);setVariantIdx(0)}}><div><Img src={v.imageUrl} kind="visual" alt={v.title}/></div><strong>{v.title}</strong><small>{formatDate(v.date)} · {v.category}</small></button>)}</div>{liver.visuals.filter(v=>visualFilter==='all'||v.category===visualFilter).length===0&&<div className="empty-small">ビジュアル情報は未登録です。</div>}</>}</div>}
          {tab==='music'&&<div className="tab-content"><h2>音楽作品</h2>{musicDetail?<><button className="small-back" onClick={()=>setMusicDetail(null)}><ArrowLeft size={17}/> 一覧へ戻る</button><div className="music-large"><Img src={musicDetail.thumbnailUrl} kind="video" alt={musicDetail.title}/></div><h3>{musicDetail.title}</h3><dl className="metadata"><dt>分類</dt><dd>{musicLabels[musicDetail.category]}</dd><dt>公開日</dt><dd>{formatDate(musicDetail.date)}</dd><dt>参加者</dt><dd>{musicDetail.participantIds.map(id=>livers.find(l=>l.id===id)?.name||'未登録').join('・')}</dd></dl><ButtonLink href={musicDetail.youtubeUrl}>YouTubeで見る</ButtonLink></>:<><select className="wide-select" value={musicCategory} onChange={e=>setMusicCategory(e.target.value as Music['category'])}>{Object.entries(musicLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><label className="sort-row">公開日 <select value={musicNewest?'new':'old'} onChange={e=>setMusicNewest(e.target.value==='new')}><option value="old">古い順</option><option value="new">新しい順</option></select></label>{liverMusic.filter(m=>m.category===musicCategory).sort((a,b)=>dateSort(a.date,b.date,!musicNewest)).map(m=><button key={m.id} className="video-row music-row" onClick={()=>setMusicDetail(m)}><div className="video-thumb"><Img src={m.thumbnailUrl} kind="video"/></div><div className="video-body"><strong>{m.title}</strong><small>{formatDate(m.date)}</small><small>{m.participantIds.map(id=>livers.find(l=>l.id===id)?.name||'未登録').join('・')}</small></div><ChevronRight size={17}/></button>)}{liverMusic.filter(m=>m.category===musicCategory).length===0&&<div className="empty-small">楽曲情報は未登録です。</div>}</>}</div>}
          {tab==='history'&&<div className="tab-content"><h2>活動履歴</h2>{eventDetail?<><button className="small-back" onClick={()=>setEventDetail(null)}><ArrowLeft size={17}/> 履歴へ戻る</button><h3>{eventDetail.title}</h3><p>{formatDate(eventDetail.date)}</p><p>{eventDetail.description||'詳細は未登録です。'}</p></>:<><div className="filter-row"><label>年<select value={historyYear} onChange={e=>setHistoryYear(e.target.value)}><option value="all">すべて</option>{activityYears.map(y=><option key={y} value={y}>{y}年</option>)}</select></label><label>カテゴリ<select value={historyCategory} onChange={e=>setHistoryCategory(e.target.value)}><option value="all">すべて</option>{Object.entries(eventLabels).map(([id,title])=><option key={id} value={id}>{title}</option>)}</select></label></div><label className="sort-row">表示順<select value={historyNewest?'new':'old'} onChange={e=>setHistoryNewest(e.target.value==='new')}><option value="new">新しい順</option><option value="old">古い順</option></select></label><div className="timeline">{timeline.map(e=><button className="timeline-entry" key={e.id} onClick={()=>{
              if(e.category==='visual'){setTab('visual');setVisualDetail(liver.visuals.find(v=>v.id===e.target)||null);setVariantIdx(0);}else if(e.category==='music'){setTab('music');setMusicDetail(liverMusic.find(m=>m.id===e.target)||null);}else if(e.id.startsWith('event:')){setEventDetail(liver.events.find(ev=>ev.id===e.target)||null);}else{setTab('visual');}
            }}><div className="timeline-icon">{e.category==='music'?<Music2 size={19}/>:e.category==='visual'?<ImageIcon size={19}/>:<CalendarDays size={19}/>}</div><div><small>{formatDate(e.date)}</small><strong>{e.title}</strong><span className="chip">{eventLabels[e.category]||'活動'}</span></div><ChevronRight size={16}/></button>)}</div>{!timeline.length&&<div className="empty-small">該当する活動履歴はありません。</div>}</>}</div>}
        </section>
        <section className="section tabs-section"><div className="tab-content"><h2>詳細プロフィール・変更履歴</h2><div className="tab-content"><h2>詳細プロフィール</h2>{liver.fields.map(group=><div className="accordion" key={group.section}><button onClick={()=>setExpanded(v=>v.includes(group.section)?v.filter(x=>x!==group.section):[...v,group.section])}><span>{group.section}</span>{expanded.includes(group.section)?<ChevronUp size={17}/>:<ChevronDown size={17}/>}</button>{expanded.includes(group.section)&&<div className="fields">{group.items.map(f=>renderField(f.label,f.data))}</div>}</div>)}{liver.fields.length===0&&<div className="empty-small">詳細プロフィールは未登録です。</div>}<div className="accordion"><button onClick={()=>setExpanded(v=>v.includes('__history')?v.filter(x=>x!=='__history'):[...v,'__history'])}><span>プロフィール変更履歴</span>{expanded.includes('__history')?<ChevronUp size={17}/>:<ChevronDown size={17}/>}</button>{expanded.includes('__history')&&<div className="change-list">{liver.changes.length?liver.changes.slice().sort((a,b)=>b.changedAt.localeCompare(a.changedAt)).map(c=><div className="change-item" key={c.id}><small>{formatDate(c.changedAt)} · {c.field}</small><p>変更前：{str(c.oldValue)}</p><p>変更後：{str(c.newValue)}</p></div>):<div className="empty-small">履歴はまだ登録されていません。</div>}</div>}</div></div></div></section>
      </>:<div className="empty"><p>該当するライバーは見つかりません。</p><button className="outline-button" onClick={()=>go('livers')}>ライバー一覧へ</button></div>)}
      {dataset&&route.page==='settings'&&<><div className="page-heading"><span className="eyebrow">PREFERENCES</span><h1>設定</h1><p>表示方法やデータの状態を確認できます。</p></div><div className="setting-card"><h2>外観</h2><div className="setting-row"><div><strong>表示テーマ</strong><small>設定はこの端末に保存されます</small></div><div className="theme-toggle"><button className={theme==='light'?'active':''} onClick={()=>setTheme('light')}><Sun size={16}/> ライト</button><button className={theme==='dark'?'active':''} onClick={()=>setTheme('dark')}><Moon size={16}/> ダーク</button><button className={theme==='system'?'active':''} onClick={()=>setTheme('system')}>自動</button></div></div></div><div className="setting-card"><h2>データ更新</h2><div className="setting-row"><span>プロフィール情報</span><small>必要なときにJSONを編集</small></div><div className="setting-row"><span>YouTube新着</span><small>12時間ごと（予定）</small></div><div className="setting-row"><span>ライブ状態</span><small>30分ごと（予定）</small></div><div className="setting-row"><span>一覧データ最終更新</span><small>{formatTime(dataset.generatedAt)}</small></div><div className="notice">公式確認済みの一部プロフィールを先行表示しています。YouTubeの自動更新・全員分の公式プロフィール照合は未完了です。</div><button className="outline-button" onClick={()=>window.location.reload()}>公開済みデータを再確認する</button></div><div className="setting-card"><h2>このサイトについて</h2><p>にじさんじデータベース（NIJI DB）</p><p className="muted">非公式・個人制作のファン向けデータベースです。ANYCOLOR株式会社および「にじさんじ」公式とは関係ありません。</p></div></>}
    </main>
    <nav className="bottom-nav" style={{display:route.page==='profile'?'none':undefined}} aria-label="メインナビゲーション"><div>{navItems.map(item=><button key={item.page} className={route.page===item.page||(route.page==='profile'&&item.page==='livers')?'active':''} onClick={()=>go(item.page)}><item.icon size={22}/><span>{item.label}</span></button>)}</div></nav>
    {sourceField&&<div className="modal-backdrop" onClick={()=>setSourceField(null)}><div className="source-sheet" role="dialog" aria-modal="true" aria-label="出典詳細" onClick={e=>e.stopPropagation()}><div className="sheet-grip"/><h2>{sourceField.title}</h2><p>{str(sourceField.field.value)}</p><h3>公式出典</h3>{sourceField.field.sources?.map((s,i)=><ButtonLink key={i} href={s.url}>{s.label}</ButtonLink>)}<button className="expand-button" onClick={()=>setSourceField(null)}>閉じる</button></div></div>}
  </div>;
}
function LiverCard({liver,onClick}:{liver:Liver;onClick:()=>void}) {return <button className="liver-card" onClick={onClick}><div className="liver-card-media"><Img src={liver.portraitUrl} alt={liver.name}/></div><div className="liver-card-content"><strong>{liver.name}</strong><small>{str(liver.group)}</small><div className="card-foot"><span>{formatDate(liver.debutDate.value)}</span><span>{str(liver.fanMark.value)}</span></div></div></button>}
