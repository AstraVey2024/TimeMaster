import {normalizeFormatting} from './formatting.mjs';
import {shiftEventDates} from './dates.mjs';
export const STATUSES={pending:{label:'未开始',icon:'○'},active:{label:'进行中',icon:'◐'},done:{label:'已完成',icon:'✓'},blocked:{label:'阻塞',icon:'!'},canceled:{label:'已取消',icon:'—'}};
export function normalizeProject(state){
  for(const e of state.events){e.status=Object.hasOwn(STATUSES,e.status)?e.status:'pending';e.owner=typeof e.owner==='string'?e.owner:'';e.locked=!!e.locked;e.showStatus=e.showStatus===true;e.showOwner=e.showOwner===true;e.datePosition=['left','right','top','bottom'].includes(e.datePosition)?e.datePosition:'left';}
  for(const g of state.groups){g.locked=!!g.locked;g.collapsed=!!g.collapsed;g.color=/^#[0-9a-f]{6}$/i.test(g.color)?g.color:'#e8ede2';g.opacity=Number.isFinite(g.opacity)?Math.max(0,Math.min(1,g.opacity)):.75;}
  return normalizeFormatting(state);
}
export function metadata(e){const parts=[],s=STATUSES[e.status];if(e.showStatus===true&&s)parts.push(`${s.icon} ${s.label}`);if(e.showOwner===true&&e.owner)parts.push(e.owner);return parts.join(' · ');}
export function toggleSelection(current,id){const ids=new Set(current?.kind==='multi'?current.ids:current?.kind==='event'?[current.id]:[]);ids.has(id)?ids.delete(id):ids.add(id);return selectionFromIds([...ids]);}
export function selectionFromIds(ids){return ids.length>1?{kind:'multi',ids}:ids.length?{kind:'event',id:ids[0]}:null;}
export function selectedIds(selection){return ['multi','all'].includes(selection?.kind)?selection.ids:selection?.kind==='event'?[selection.id]:[];}
export function groupSummary(events){const done=events.filter(e=>e.status==='done').length;return {total:events.length,done,percent:events.length?Math.round(done/events.length*100):0};}
export function applyBatch(state,ids,patch){
  const selected=new Set(ids);
  for(const e of state.events.filter(e=>selected.has(e.id))){
    if(patch.status!==undefined&&Object.hasOwn(STATUSES,patch.status))e.status=patch.status;
    if(patch.owner!==undefined)e.owner=patch.owner;
    if(patch.showDate!==undefined)e.showDate=patch.showDate;
    if(patch.showStatus!==undefined)e.showStatus=patch.showStatus;
    if(patch.showOwner!==undefined)e.showOwner=patch.showOwner;
    if(patch.datePosition!==undefined&&['left','right','top','bottom'].includes(patch.datePosition))e.datePosition=patch.datePosition;
    if(patch.showProgress!==undefined&&e.type==='period')e.showProgress=patch.showProgress;
    if(patch.progress!==undefined&&e.type==='period')e.progress=Math.max(0,Math.min(100,patch.progress));
    if(patch.days)shiftEventDates(e,{...e},patch.days);
    if(patch.group!==undefined){e.group=patch.group;e.manual=false;e.locked=false;if(e.group){const g=state.groups.find(g=>g.id===e.group);if(g){e.side=g.side;g.collapsed=false;}}}
  }
}
export function hitsInRectangle(rect,positions,axis){
  const ids=[];for(const [id,p] of positions){const top=axis+p.side*p.offset-p.height/2,bottom=top+p.height;
    if(p.left<=rect.right&&p.right>=rect.left&&top<=rect.bottom&&bottom>=rect.top)ids.push(id);
  }return ids;
}
export function dragMode({shift=false,handle='',locked=false,marquee=false,hasElement=false}){
  if(marquee)return 'marquee';
  if(handle)return handle==='start'?'resize-start':'resize-end';
  if(!hasElement)return 'pan';
  if(shift)return 'date';
  return locked?null:'layout';
}
export function resizeDates(event,original,delta,edge){
  const DAY=86400000,day=s=>Date.parse(s+'T00:00:00Z')/DAY,date=n=>new Date(n*DAY).toISOString().slice(0,10);
  event.start=original.start;event.end=original.end;
  if(edge==='start')event.start=date(Math.min(day(original.end),day(original.start)+delta));
  else event.end=date(Math.max(day(original.start),day(original.end)+delta));
}
