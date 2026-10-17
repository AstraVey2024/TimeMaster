import {normalizeLayout,groupMetrics,textStyle,textWidth} from './formatting.mjs';
import {labelMetrics} from './presentation.mjs';
// Coordinates use distance from the axis, independently for each side.
const GAP = 7;
export function measure(e,x){
  const m=labelMetrics(e),start=x(e.start),end=e.type==='period'?x(e.end):start;
  const progressStyle=textStyle(e,'progress',9);
  const width=Math.max(65,m.baseWidth,end-start,e.image?164:0,e.showProgress?textWidth((e.progress??0)+'%',progressStyle)+16:0);
  return {x:start,end,center:(start+end)/2,width,left:(start+end-width)/2,right:(start+end+width)/2,
    labelHeight:m.labelHeight,height:m.labelHeight+(e.image?104:0)+(e.type==='period'&&e.showProgress?Math.max(26,progressStyle.size*1.2+12):6)};
}
export function intersects(a, b, gap = GAP) {
  return a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top;
}
function place(rect, used, gap=GAP) {
  // Check every candidate gap instead of jumping beneath the tallest collision.
  const height = rect.bottom - rect.top;
  const candidates = [rect.top, ...used.map(b => b.bottom + gap)].filter(y => y >= rect.top).sort((a,b) => a-b);
  for (const top of candidates) {
    const candidate = {...rect, top, bottom: top + height};
    if (!used.some(b => intersects(candidate,b,gap))) return candidate;
  }
  throw new Error('Unable to place timeline element');
}
export function layout(events, groups, x, ppd, active = null, settings = {}) {
  events=events.filter(e=>!e.hidden);
  const spacing=normalizeLayout(settings);
  const positions = new Map(), boxes = new Map(), used = {1: [], [-1]: []}, blocks = [], conflicts=[];
  const groupIds = new Set(groups.map(g => g.id));
  for (const g of groups) {
    const es = events.filter(e => e.group === g.id);
    const locked=g.locked||es.some(e=>e.locked),gm=groupMetrics(g,es.some(e=>e.showStatus));
    blocks.push({g,gm, es, locked, side: g.side, order: g.order ?? groups.indexOf(g), manual: !!g.manual,
      preferred: locked ? Math.max(0,g.lockBase??g.offset??spacing.axisGap) : g.manual ? Math.max(spacing.axisGap,g.offset??spacing.axisGap) : spacing.axisGap});
  }
  for (const e of events.filter(e => !groupIds.has(e.group))) {
    blocks.push({es: [e], locked:!!e.locked, side: e.side, order: e.offset, manual: !!e.manual,
      preferred: e.locked?Math.max(0,e.offset-measure(e,x).height/2):e.manual ? Math.max(spacing.axisGap,e.offset-measure(e,x).height/2) : spacing.axisGap});
  }
  // Manual positions are reserved first. Selecting alone never changes layout.
  blocks.sort((a,b) => Number(!!b.locked)-Number(!!a.locked) || Number(b.manual)-Number(a.manual) || a.order-b.order);
  for (const block of blocks) {
    const local = [], items = [];
    const members = [...block.es].sort((a,b) => Number(!!b.locked)-Number(!!a.locked) || Number(!!b.manual)-Number(!!a.manual) || a.offset-b.offset || x(a.start)-x(b.start));
    for (const e of block.g?.collapsed?[]:members) {
      const m = measure(e, x);
      const inset=block.side<0?spacing.padding:block.g?block.gm.head:22;
      const top=block.g?((e.locked||block.g.locked)?Math.max(0,e.localOffset??inset):e.manual?Math.max(inset,e.localOffset??inset):inset):0;
      if(block.side>0&&block.g&&(e.locked||block.g.locked)&&top<block.gm.head)conflicts.push(e.id);
      const initial={left:m.left,right:m.right,top,bottom:top+m.height};
      if((e.locked||block.g?.locked)&&local.some(r=>intersects(initial,r,spacing.rowGap)))conflicts.push(e.id);
      const rect = (e.locked||block.g?.locked)?initial:place(initial,local,spacing.rowGap);
      local.push(rect); items.push({e,m,rect});
    }
    const margin=block.g?(block.side<0?block.gm.head:spacing.padding):0;
    const left = local.length ? Math.min(...local.map(r=>r.left))-(block.g?spacing.padding:0) : members.length?Math.min(...members.map(e=>x(e.start)))-spacing.padding-8:(block.g.anchor ? x(block.g.anchor) : 24);
    const right = Math.max(local.length ? Math.max(...local.map(r=>r.right))+(block.g?spacing.padding:0) : members.length?Math.max(...members.map(e=>x(e.end||e.start)))+spacing.padding+8:left+200, block.g ? left+block.gm.minWidth : left);
    const height = local.length ? Math.max(...local.map(r=>r.bottom))+margin : block.g?.collapsed?block.gm.height:Math.max(42,block.gm?.head+20||42);
    const initial={left,right,top:block.preferred,bottom:block.preferred+height};
    if(block.locked&&used[block.side].some(r=>intersects(initial,r,spacing.blockGap)))conflicts.push(block.g?.id??block.es[0].id);
    const rect = block.locked?initial:place(initial,used[block.side],spacing.blockGap);
    used[block.side].push(rect);
    for (const {e,m,rect:r} of items) positions.set(e.id,{...m,offset:rect.top+r.top+m.height/2,localTop:r.top,side:block.side});
    if (block.g) boxes.set(block.g.id,{...rect,side:block.side});
  }
  return {positions,boxes,conflicts,above:Math.max(40,...used[-1].map(r=>r.bottom)),below:Math.max(40,...used[1].map(r=>r.bottom))};
}
