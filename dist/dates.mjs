const DAY=86400000;
const day=s=>Date.parse(s+'T00:00:00Z')/DAY;
const iso=n=>new Date(Math.round(n)*DAY).toISOString().slice(0,10);
export function dateCaption(event){
  if(event.showDate===false)return '';
  return event.type==='period'&&event.end?`${event.start} → ${event.end}`:event.start;
}
export function displayTitle(event){const caption=dateCaption(event);return caption?(['right','bottom'].includes(event.datePosition)?`${event.title} · ${caption}`:`${caption} · ${event.title}`):event.title;}
export function migrateDateTitle(event,legacyStart=''){
  if(event.dateTitleVersion===1)return;
  // Separate recognized legacy date prefixes from editable title text once.
  const match=event.title.match(/^\s*(?:(\d{4})[-/.])?(\d{1,2})[-/.](\d{1,2})(?!\d)\s*/);
  if(match){
    const matchesDate=s=>s&&Number(match[2])===Number(s.slice(5,7))&&Number(match[3])===Number(s.slice(8,10))&&(!match[1]||Number(match[1])===Number(s.slice(0,4)));
    if(matchesDate(event.start)||matchesDate(legacyStart)){
      const rest=event.title.slice(match[0].length).trim();
      if(rest)event.title=rest;
    }
  }
  event.showDate=event.showDate!==false;event.dateTitleVersion=1;
}
export function shiftEventDates(event,original,delta){
  event.start=iso(day(original.start)+delta);event.end=original.end?iso(day(original.end)+delta):'';
}
export function groupDateRange(events){
  if(!events.length)return '暂无日期';
  const start=events.map(e=>e.start).sort()[0],end=events.map(e=>e.end||e.start).sort().at(-1);
  return start===end?start:`${start} → ${end}`;
}
export function syncEventDateFields(root,event){
  const start=root.querySelector('[data-field="start"]'),end=root.querySelector('[data-field="end"]'),preview=root.querySelector('#titlePreview');
  if(start)start.value=event.start;if(end)end.value=event.end;if(preview)preview.textContent=displayTitle(event);
}
