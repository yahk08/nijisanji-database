import { useState } from 'react';
import { BookOpen, ExternalLink } from 'lucide-react';
import type { Liver } from './types';

const services = [
  ['youtube', 'YouTube', 'sns/youtube_orig.svg'],
  ['twitch', 'Twitch', 'sns/twitch_orig.svg'],
  ['x', 'X', 'sns/x_black.svg'],
  ['tiktok', 'TikTok', null],
  ['fanclub', 'ファンクラブ', 'fanclub.svg'],
  ['store', '公式ストア', 'official-store.png'],
  ['magazine', 'エニマガ', 'anycolor-magazine.png'],
  ['wiki', '非公式Wiki', null],
  ['official', '公式プロフィール', null],
] as const;

function safeUrl(value?: string | null) {
  if (!value) return false;
  try { const u = new URL(value); return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password; }
  catch { return false; }
}
function ServiceIcon({path, wiki}: {path: string | null; wiki: boolean}) {
  const [failed, setFailed] = useState(false);
  return path && !failed
    ? <img className="service-icon" src={`https://www.nijisanji.jp/icon/${path}`} alt="" loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>
    : wiki ? <BookOpen size={20} aria-hidden="true"/> : <ExternalLink size={20} aria-hidden="true"/>;
}
export function ProfileLinks({liver}: {liver: Liver}) {
  const links = {youtube:liver.youtubeChannelUrl, x:liver.xUrl, wiki:liver.provenance?.wiki.url, ...liver.profileLinks, official:liver.officialProfileUrl};
  const available = services.filter(([key])=>safeUrl(links[key]));
  if (!available.length) return null;
  return <section className="section"><h2>公式リンク・関連サイト</h2><div className="profile-links">{available.map(([key,label,path])=>
    <a className="outline-button" key={key} href={links[key]!} target="_blank" rel="noopener noreferrer"><ServiceIcon path={path} wiki={key==='wiki'}/><span>{label}</span></a>
  )}</div></section>;
}
