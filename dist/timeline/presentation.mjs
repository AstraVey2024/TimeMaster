import {textWidth,textStyle} from './formatting.mjs';
import {dateCaption} from './dates.mjs';
import {metadata} from './project.mjs';
export function labelMetrics(e){
  const scale=e.scale,caption=dateCaption(e),position=['left','right','top','bottom'].includes(e.datePosition)?e.datePosition:'left';
  const title=(e.icon?e.icon+' ':'')+(e.note?'✎ ':'')+e.title,meta=metadata(e),horizontal=!!caption&&['left','right'].includes(position);
  const titleStyle=textStyle(e,'title',12),dateStyle=textStyle(e,'date',10),metaStyle=textStyle(e,'metadata',9);
  const titleWidth=textWidth(title,titleStyle,scale),dateWidth=caption?textWidth(caption,dateStyle,scale):0,reserve=(e.url?23:0)+(e.locked?14:0);
  const titleLine=Math.max(28*scale,titleStyle.size*scale*1.5+8*scale),dateLine=caption?dateStyle.size*scale*1.2+2*scale:0;
  const coreHeight=horizontal?Math.max(titleLine,dateLine+8*scale):titleLine+dateLine;
  return {caption,position,title,meta,horizontal,dateWidth,coreHeight,reserve,titleStyle,dateStyle,metaStyle,titleLine,dateLine,
    labelHeight:coreHeight+(meta?Math.max(15*scale,metaStyle.size*scale*1.2+4*scale):0),
    baseWidth:Math.max((horizontal?titleWidth+dateWidth+9*scale:Math.max(titleWidth,dateWidth))+16*scale+reserve,textWidth(meta,metaStyle,scale)+16*scale+reserve)};
}
export function labelCoordinates(e,width,m=labelMetrics(e)){
  const scale=e.scale,pad=8*scale,right=width-pad-m.reserve;
  let titleLeft=pad,titleRight=right,dateX=width/2,dateAnchor='middle',dateY=m.dateLine*.82,titleY=(m.titleLine+m.titleStyle.size*scale*.7)/2;
  if(m.position==='top'&&m.caption)titleY+=m.dateLine;
  else if(m.position==='bottom')dateY=m.titleLine+m.dateLine*.82;
  else if(m.horizontal){titleY=dateY=(m.coreHeight+Math.max(m.titleStyle.size,m.dateStyle.size)*scale*.7)/2;if(m.position==='left'){dateX=pad;dateAnchor='start';titleLeft=pad+m.dateWidth+9*scale;}else{dateX=right;dateAnchor='end';titleRight=right-m.dateWidth-9*scale;}}
  const titleAnchor=e.align==='left'?'start':e.align==='right'?'end':'middle';
  return {titleX:titleAnchor==='start'?titleLeft:titleAnchor==='end'?titleRight:(titleLeft+titleRight)/2,titleY,titleAnchor,dateX,dateY,dateAnchor,metaY:m.coreHeight+m.metaStyle.size*scale+scale};
}
export function groupStyle(g){
  const color=/^#[0-9a-f]{6}$/i.test(g.color)?g.color:'#e8ede2',opacity=Number.isFinite(g.opacity)?Math.max(0,Math.min(1,g.opacity)):.75;
  const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
  const brightness=rgb.reduce((sum,v,i)=>sum+(v*opacity+250*(1-opacity))*[.299,.587,.114][i],0);
  return {color,opacity,text:brightness<140?'#ffffff':'#42583e'};
}
