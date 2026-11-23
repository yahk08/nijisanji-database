import {useEffect,useRef,useState} from 'react';

export function PortraitViewer({src,name,onClose}:{src:string;name:string;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [zoom,setZoom]=useState(1);
  const [offset,setOffset]=useState({x:0,y:0});
  const pointers=useRef(new Map<number,{x:number;y:number}>());
  const gesture=useRef<{distance:number;zoom:number}|null>(null);
  const clamp=(n:number)=>Math.max(1,Math.min(5,n));
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;
    dialog.current?.showModal();document.body.style.overflow='hidden';
    return()=>{document.body.style.overflow=overflow;previous?.focus();};
  },[]);
  const scale=(n:number)=>{setZoom(clamp(n));if(n<=1)setOffset({x:0,y:0});};
  const distance=()=>{const [a,b]=[...pointers.current.values()];return a&&b?Math.hypot(a.x-b.x,a.y-b.y):0;};
  return <dialog ref={dialog} className="portrait-dialog" aria-label={`${name}の全身画像`} onCancel={e=>{e.preventDefault();onClose();}}>
    <div className="portrait-toolbar"><strong>{name}</strong><button aria-label="縮小" disabled={zoom<=1} onClick={()=>scale(zoom-.5)}>−</button><output aria-live="polite">{Math.round(zoom*100)}%</output><button aria-label="拡大" disabled={zoom>=5} onClick={()=>scale(zoom+.5)}>＋</button><button onClick={()=>{scale(1);setOffset({x:0,y:0});}}>全身表示</button><button onClick={onClose} autoFocus>閉じる</button></div>
    <p className="viewer-help">ピンチ・ホイールで拡大、ドラッグで移動。Escキーで閉じます。</p>
    <div className="portrait-stage" onWheel={e=>scale(zoom+(e.deltaY<0?.15:-.15))}
      onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.current.size===2)gesture.current={distance:distance(),zoom};}}
      onPointerMove={e=>{const old=pointers.current.get(e.pointerId);if(!old)return;pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.current.size===2&&gesture.current){scale(gesture.current.zoom*distance()/Math.max(1,gesture.current.distance));}else if(zoom>1){setOffset(p=>({x:p.x+e.clientX-old.x,y:p.y+e.clientY-old.y}));}}}
      onPointerUp={e=>{pointers.current.delete(e.pointerId);gesture.current=null;}}
      onPointerCancel={e=>{pointers.current.delete(e.pointerId);gesture.current=null;}}>
      <img src={src} alt={`${name}の全身`} draggable={false} style={{transform:`translate(${offset.x}px,${offset.y}px) scale(${zoom})`}}/>
    </div>
  </dialog>;
}
