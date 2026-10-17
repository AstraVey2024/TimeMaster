import {cropBounds,outputPixels,dragCrop,croppedSvg,paintExport,projectFingerprint,blankProject,writeProjectFile} from './export-image.mjs';
import {calendarDate,inspectImport,mergeImport,reportData,reportRows,reportSvg,excelReport,pdfReport} from './transfer.mjs';
import {writeVersionSnapshot,readVersionSnapshot,snapshotDocument,documentStorageKey} from './versions.mjs';
import {FONTS,COLORS,TEXT_FIELDS,GROUP_FIELDS,LAYOUT_PRESETS,textStyle,textAttrs,normalizeTextStyle,normalizeLayout,groupMetrics,textWidth} from './formatting.mjs';
import {labelMetrics,labelCoordinates,groupStyle} from './presentation.mjs';
import {STATUSES,normalizeProject,metadata,toggleSelection,selectionFromIds,selectedIds,groupSummary,applyBatch,hitsInRectangle,dragMode,resizeDates} from './project.mjs';
import {dateCaption, displayTitle, migrateDateTitle, shiftEventDates, groupDateRange, syncEventDateFields} from './dates.mjs';
import {pushHistory, wheelIntent, panView, zoomView, historyShortcut} from './interactions.mjs';
import {layout} from './layout.mjs';
import {safeLink, safeImage, resolveSelection} from './content.mjs';
const $=s=>document.querySelector(s), DAY=86400000, NS='http://www.w3.org/2000/svg';
const PROJECT_ICONS=['','🏁','🚩','🎯','📌','⭐','✅','⚠️','⛔','🚀','🔧','🧪','📦','📋','💡','🤝','📅','🔔','🏆'];
let elementClipboard=null,pendingChange=null,canvasTool='pan',pendingVersionId=null,versionWrites=Promise.resolve(),lastCaptureId=null,lastCaptureFingerprint='';
const restoreId=window.location?new URL(window.location.href).searchParams.get('restore'):null;
const draftId=restoreId&&window.location?(new URL(window.location.href).searchParams.get('draft')||restoreId):restoreId;
const storageKey=documentStorageKey(draftId);
let restoreLoading=!!restoreId,initialDraft=null;
const failedSnapshotWrites=new Map();
let lastSavedText=null,lastSavedAt='',saveFailed=false;
try{lastSavedAt=localStorage.getItem(storageKey+':savedAt')||'';}catch{}
let localFileHandle=null,localFileText='',localFileName='',localFileBaseline='',localSavedAt='',localBusy=false,pendingLocalOpen=null;
let pageScale=1;
const pageWidth=()=>window.innerWidth/pageScale,pageHeight=()=>window.innerHeight/pageScale;
const pointerX=ev=>ev.clientX/pageScale,pointerY=ev=>ev.clientY/pageScale;
function cssRect(el){if(!el)return null;const r=el.getBoundingClientRect();return Object.fromEntries(['left','top','right','bottom','width','height'].map(k=>[k,r[k]/pageScale]));}
const day=s=>Date.parse(s+'T00:00:00Z')/DAY;
const date=n=>new Date(Math.round(n)*DAY).toISOString().slice(0,10);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const seed={title:'示例项目 · 产品交付计划',groups:[{id:'g1',name:'产品开发',side:-1},{id:'g2',name:'组件研发',side:1},{id:'g3',name:'集成与测试',side:-1}],events:[]};
[['10.15 产品方案评审','2026-10-15','g1',-1,78,'#99628a'],['11.22 开发完成','2026-11-22','g1',-1,78,'#99628a'],['12.22 交付验收','2026-12-22','g1',-1,78,'#99628a'],['09.30 组件 A 设计完成','2026-09-30','g2',1,75,'#628c56'],['10.09 组件 B 设计完成','2026-10-09','g2',1,125,'#628c56'],['10.15 组件 C 设计完成','2026-10-15','g2',1,175,'#628c56'],['11.07 组件 A 样件到货','2026-11-07','g2',1,75,'#628c56'],['11.11 组件 B 首样交付','2026-11-11','g2',1,125,'#5d7eaa'],['11.12 组件 A 首样交付','2026-11-12','g2',1,175,'#5d7eaa'],['11.17 组件 C 首样交付','2026-11-17','g2',1,225,'#5d7eaa'],['11.22 系统集成调测','2026-11-22','g3',-1,155,'#8c9cab'],['11.28 集成测试','2026-11-28','g3',-1,202,'#8c9cab'],['11.30 客户送测','2026-11-30','',-1,280,'#c65d42'],['研发试制','2026-12-21','',-1,158,'#628c56'],['小批量试制','2026-12-24','',-1,205,'#628c56'],['12.30 发布评审','2026-12-30','',-1,265,'#c65d42']].forEach((a,i)=>seed.events.push({id:'e'+i,title:a[0],start:a[1],end:'',group:a[2],side:a[3],offset:a[4],color:a[5],textColor:'#ffffff',description:'',scale:1,align:'center',design:'label',tags:''}));
function valid(v) {
  return v && typeof v.title==='string' && Array.isArray(v.groups) && Array.isArray(v.events) &&
    v.groups.every(g=>g&&typeof g.id==='string'&&typeof g.name==='string'&&[-1,1].includes(g.side)) &&
    v.events.every(e=>e&&typeof e.id==='string'&&typeof e.title==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(e.start)&&calendarDate(e.start)&&
      (!e.end||(/^\d{4}-\d{2}-\d{2}$/.test(e.end)&&calendarDate(e.end)&&day(e.end)>=day(e.start)))&&[-1,1].includes(e.side)&&
      Number.isFinite(e.offset)&&e.offset>=0&&e.offset<=100000&&Number.isFinite(e.scale)&&e.scale>=.6&&e.scale<=1.8&&
      /^#[0-9a-f]{6}$/i.test(e.color)&&/^#[0-9a-f]{6}$/i.test(e.textColor)) &&
    new Set([...v.groups,...v.events].map(e=>e.id)).size===v.groups.length+v.events.length;
}
function normalize(v) {
  for (const e of v.events) {
    e.type=e.end?'period':'milestone';migrateDateTitle(e,seed.events.find(v=>v.id===e.id)?.start); e.offset=Math.max(20,e.offset);
    e.image=safeImage(e.image);e.imageThumb=safeImage(e.imageThumb); e.url=safeLink(e.url); e.note=!!e.note;
    e.manual=!!e.manual; e.localOffset=Number.isFinite(e.localOffset)?Math.max(25,e.localOffset):25;
  }
  for (const g of v.groups) {g.manual=!!g.manual;g.offset=Number.isFinite(g.offset)?Math.max(20,g.offset):20;}
  v.floatingLabels=Array.isArray(v.floatingLabels)?v.floatingLabels.filter(e=>e&&typeof e.id==='string'&&typeof e.title==='string'&&Number.isFinite(e.x)&&Number.isFinite(e.y)).map(e=>({...e,color:/^#[0-9a-f]{6}$/i.test(e.color)?e.color:'#fff2cc',textColor:/^#[0-9a-f]{6}$/i.test(e.textColor)?e.textColor:'#22332e'})):[];
  v.projectInfo=v.projectInfo&&typeof v.projectInfo==='object'?v.projectInfo:{};
  v.revisions=retainRevisions(v.revisions);
  return normalizeProject(v);
}
let state=structuredClone(seed);
try {const saved=JSON.parse(localStorage.getItem(storageKey));if(valid(saved)){state=saved;lastSavedText=JSON.stringify(saved);if(restoreId)initialDraft=saved;}} catch {}
normalize(state);localFileBaseline=projectFingerprint(state);
let selected=null, computed, undo=[], redo=[], drag=null, contentTarget=null, contentMode='', contentToken=0, contentPlacement=null, contextPlacement=null, toastTimer;
let view={start:day('2026-09-01'),ppd:7,axis:300,panY:0};
const svg=$('#canvas'), stage=$('#stage');
function snapshot(){pushHistory(undo,JSON.stringify(state));redo.length=0;pendingChange=JSON.stringify(state);}
function toast(message){$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',2600);}
function save(){
  recordPendingChange();flushVersionCapture();refreshProjectInfo();
  try {if(!restoreLoading){const serialized=JSON.stringify(state);if(serialized!==lastSavedText){localStorage.setItem(storageKey,serialized);lastSavedText=serialized;lastSavedAt=new Date().toISOString();try{localStorage.setItem(storageKey+':savedAt',lastSavedAt);}catch{}}saveFailed=false;}$('#status').textContent=(restoreId?'历史副本 · ':'')+(restoreLoading?'正在读取…':`最近保存 ${lastSavedAt?new Date(lastSavedAt).toLocaleTimeString('zh-CN',{hour12:false}):'—'}`);}
  catch {saveFailed=true;$('#status').textContent='保存失败 · 更改尚未保存';}
  $('#saveFailure').hidden=!saveFailed&&!failedSnapshotWrites.size;$('#saveFailureMessage').textContent=saveFailed?'保存失败，当前更改尚未写入浏览器。请立即导出备份。':'历史快照保存失败。当前项目已保存，可重试或立即导出完整备份。';
  refreshLocalFileStatus();
  $('#undo').disabled=!undo.length;$('#redo').disabled=!redo.length;
  $('#summary').textContent=`${state.groups.length} 个分组 · ${state.events.length} 个节点`;
  $('#count').textContent=state.events.length;$('#projectTitle').value=state.title;
}
function node(tag,attrs={},text){const el=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);if(text!==undefined)el.textContent=text;return el;}
function append(tag,attrs,text){const n=node(tag,attrs,text);svg.append(n);return n;}
const X=d=>(day(d)-view.start)*view.ppd;
const sortedEvents=()=>[...state.events].sort((a,b)=>a.start.localeCompare(b.start)||(a.end||a.start).localeCompare(b.end||b.start)||a.title.localeCompare(b.title,'zh-CN'));
const isSelectedEvent=id=>selectedIds(selected).includes(id);
function statusOptions(value='',blank=false){return (blank?'<option value="">保持原状态</option>':'')+Object.entries(STATUSES).map(([k,v])=>`<option value="${k}" ${value===k?'selected':''}>${v.icon} ${v.label}</option>`).join('');}

function render(){
  svg.replaceChildren();const w=stage.clientWidth;
  computed=layout(state.events,state.groups,X,view.ppd,null,state.layout);
  const baseAxis=120+computed.above;
  const axis=drag&&(drag.event||drag.group)?drag.axis:baseAxis+view.panY,h=Math.max(stage.clientHeight,baseAxis+computed.below+65,...state.floatingLabels.map(e=>e.y+textStyle(e,'title',14).size*1.5+40));
  view.axis=axis;svg.style.height=h+'px';svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
  const month=new Date(Math.floor(view.start)*DAY);month.setUTCDate(1);
  for(let i=0;i<200;i++){
    const x=(month.getTime()/DAY-view.start)*view.ppd;if(x>w+350)break;
    append('line',{x1:x,y1:0,x2:x,y2:h,stroke:'#e3e5e8'});
    append('text',{x:x+9,y:axis-15,fill:'#747a83','font-size':11},month.toLocaleDateString('zh-CN',{year:'numeric',month:'long',timeZone:'UTC'}));
    if(view.ppd>3)for(const d of [10,20]){const xx=x+(d-1)*view.ppd;append('line',{x1:xx,y1:axis-4,x2:xx,y2:axis+5,stroke:'#a3a8af'});append('text',{x:xx,y:axis+21,fill:'#969ca4','font-size':10,'text-anchor':'middle'},d);}
    month.setUTCMonth(month.getUTCMonth()+1);
  }
  const groupLayer=append('g',{'data-layer':'groups'});
  for(const g of state.groups){
    const style=groupStyle(g),gm=groupMetrics(g,state.events.some(e=>e.group===g.id&&e.showStatus)),b=computed.boxes.get(g.id),top=b.side<0?axis-b.bottom:axis+b.top,isSelected=(selected?.kind==='group'&&selected.id===g.id)||(selected?.kind==='all'&&selected.groupIds.includes(g.id));
    const el=node('g',{class:'group-element','data-group':g.id,tabindex:0,role:'button','aria-label':g.name,'aria-pressed':isSelected});groupLayer.append(el);
    el.append(node('rect',{x:b.left,y:top,width:b.right-b.left,height:b.bottom-b.top,rx:g.design==='square'?0:g.design==='round'?20:7,fill:style.color,'fill-opacity':style.opacity,stroke:isSelected?'#c7000b':'#b8bdc5','stroke-width':isSelected?2:1,'stroke-dasharray':isSelected?'':'5 3'}));
    el.append(node('text',{x:b.left+9,y:top+gm.nameY,...textAttrs(g,'name',10,1,style.text),'data-inline':'name'},(g.collapsed?'▸ ':'▾ ')+(g.icon?g.icon+' ':'')+g.name+(g.locked?' · 锁定':'')));
    const members=state.events.filter(e=>e.group===g.id),summary=groupSummary(members),hasTracking=members.some(e=>e.showStatus);
    el.append(node('title',{},`${g.name} · ${hasTracking?`${summary.done}/${summary.total} 已完成`:`${summary.total} 个节点`} · ${groupDateRange(members)}`));
    const toggle=node('g',{'data-toggle-group':g.id,role:'button','aria-label':g.collapsed?'展开分组':'折叠分组',tabindex:0});
    toggle.append(node('rect',{x:b.right-27,y:top+3,width:23,height:20,rx:4,fill:'#f2f3f5'}));
    toggle.append(node('text',{x:b.right-15,y:top+17,'text-anchor':'middle',fill:'#60656d','font-size':13,'pointer-events':'none'},g.collapsed?'+':'−'));el.append(toggle);
    if(g.collapsed){
      el.append(node('text',{x:b.left+11,y:top+gm.rangeY,...textAttrs(g,'range',10,1,style.text),'pointer-events':'none'},groupDateRange(members)));
      el.append(node('text',{x:b.left+11,y:top+gm.summaryY,...textAttrs(g,'summary',10,1,style.text),'pointer-events':'none'},hasTracking?`${summary.total} 个节点 · ${summary.done} 已完成 · ${summary.percent}%`:`${summary.total} 个节点`));
      if(hasTracking)el.append(node('rect',{x:b.left+11,y:top+gm.progressY,width:b.right-b.left-22,height:5,rx:2,fill:'#d4dfcb'}));
      if(hasTracking)el.append(node('rect',{x:b.left+11,y:top+gm.progressY,width:(b.right-b.left-22)*summary.percent/100,height:5,rx:2,fill:'#6d9960'}));
    }
  }
  append('line',{x1:0,y1:axis,x2:w,y2:axis,stroke:'#757b83','stroke-width':3,'pointer-events':'none'});
  // Non-interactive connectors cannot steal a click intended for a group behind them.
  for(const e of state.events){const m=computed.positions.get(e.id);if(!m)continue;const y=axis+m.side*m.offset;
    for(const x of e.type==='period'?[m.x,m.end]:[m.x]){
      append('line',{x1:x,y1:axis,x2:x,y2:y,stroke:e.color,'stroke-opacity':.36,'stroke-dasharray':'4 4','pointer-events':'none'});
      append('circle',{cx:x,cy:axis,r:3,fill:e.color,'pointer-events':'none'});
    }
  }
  const elementLayer=append('g',{'data-layer':'elements'});
  for(const e of state.events){
    const m=computed.positions.get(e.id);if(!m)continue;const y=axis+m.side*m.offset,top=y-m.height/2,bh=m.labelHeight,lm=labelMetrics(e),lc=labelCoordinates(e,m.width,lm);
    const el=node('g',{class:'event','data-id':e.id,tabindex:0,role:'button','aria-label':displayTitle(e),'aria-pressed':isSelectedEvent(e.id)});
    el.append(node('title',{},`${e.type==='period'?'时间段':'里程碑'} · ${e.start}${e.end?' → '+e.end:''}`));
    if(isSelectedEvent(e.id))el.append(node('rect',{x:m.left-4,y:top-4,width:m.width+8,height:m.height+8,rx:7,fill:'none',stroke:'#c7000b','stroke-dasharray':'4 3'}));
    el.append(node('rect',{x:m.left,y:top,width:m.width,height:bh,rx:e.design==='round'?bh/2:e.design==='square'?0:5,fill:e.color,'fill-opacity':Number.isFinite(e.opacity)?e.opacity:1}));
    if(lm.caption)el.append(node('text',{x:m.left+lc.dateX,y:top+lc.dateY,...textAttrs(e,'date',10,e.scale,e.textColor),'fill-opacity':.85,'text-anchor':lc.dateAnchor,'data-inline':'date'},lm.caption));
    el.append(node('text',{x:m.left+lc.titleX,y:top+lc.titleY,...textAttrs(e,'title',12,e.scale,e.textColor),'text-anchor':lc.titleAnchor,'data-inline':'title'},lm.title));
    if(lm.meta)el.append(node('text',{x:m.left+8*e.scale,y:top+lc.metaY,...textAttrs(e,'metadata',9,e.scale,e.textColor),'fill-opacity':.85,'pointer-events':'none'},lm.meta));
    if(e.locked)el.append(node('text',{x:m.right-(e.url?30:10),y:top+11,fill:e.textColor,'font-size':8,'text-anchor':'middle','pointer-events':'none'},'▣'));
    if(e.image){
      el.append(node('rect',{x:m.left,y:top+bh+4,width:m.width,height:98,rx:5,fill:'#ffffff',stroke:'#d5dfce'}));
      el.append(node('image',{href:e.imageThumb||e.image,x:m.left+3,y:top+bh+7,width:m.width-6,height:92,preserveAspectRatio:'xMidYMid meet','pointer-events':'none'}));
    }
    if(e.type==='period'){
      const yy=e.showProgress?top+bh+(e.image?104:0)+5:top+bh+(e.image?104:0)-1;
      if(e.showProgress){
        const width=Math.max(8,m.end-m.x),left=(m.x+m.end-width)/2,progress=Math.max(0,Math.min(100,e.progress??0));
        const track=node('g',{'data-progress':e.id,role:'progressbar','aria-label':e.title+' 完成度','aria-valuemin':0,'aria-valuemax':100,'aria-valuenow':progress});
        track.append(node('rect',{x:left,y:yy,width,height:5,rx:2.5,fill:'#dfe5db'}));
        track.append(node('rect',{x:left,y:yy,width:width*progress/100,height:5,rx:2.5,fill:e.progressColor||'#4472c4'}));
        track.append(node('text',{x:m.center,y:yy+5+textStyle(e,'progress',9).size,...textAttrs(e,'progress',9,1,e.progressColor||e.color),'text-anchor':'middle','pointer-events':'none'},progress+'%'));
        el.append(track);
      }
      if(isSelectedEvent(e.id))for(const [edge,x] of [['start',m.x],['end',m.end]])el.append(node('circle',{cx:x,cy:yy,r:5,fill:e.color,stroke:'#fff','stroke-width':2,'data-resize':edge,class:'resize-handle'}));
    }else if(!e.image)el.append(node('path',{d:`M ${m.center} ${top+bh-1} l -2 2 l 2 2 l 2 -2 Z`,fill:e.color}));
    if(e.url){
      const link=node('a',{href:e.url,target:'_blank',rel:'noopener noreferrer','aria-label':'打开链接：'+e.title,class:'event-link'});
      link.append(node('rect',{x:m.right-23,y:top+3,width:20,height:bh-6,rx:3,fill:'#ffffff',opacity:.16}));
      link.append(node('text',{x:m.right-13,y:top+lc.titleY,fill:e.textColor,'font-size':13,'text-anchor':'middle'},'↗'));
      el.append(link);
    }
    elementLayer.append(el);
  }
  if(drag?.mode==='marquee'&&drag.rect)append('rect',{x:drag.rect.left,y:drag.rect.top,width:drag.rect.right-drag.rect.left,height:drag.rect.bottom-drag.rect.top,fill:'#c7000b','fill-opacity':.12,stroke:'#c7000b','stroke-dasharray':'4 3','pointer-events':'none'});
  $('#layoutWarning').hidden=!computed.conflicts.length;
  const lockActive=selected?.kind==='group'?!!state.groups.find(g=>g.id===selected.id)?.locked:selectedIds(selected).length>0&&state.events.filter(e=>selectedIds(selected).includes(e.id)).every(e=>e.locked);
  $('#lockSelection').textContent=lockActive?'▣ 解锁位置':'▣ 锁定位置';$('#lockSelection').disabled=!selected;
  $('#selectionCount').textContent=selected?.kind==='all'?`${selected.scope==='rectangle'?'已框选':'已全选'} ${selected.ids.length+selected.groupIds.length+selected.floatingIds.length} 个元素`:selectedIds(selected).length?`已选 ${selectedIds(selected).length} 个节点`:'';
  const feedback=$('#dragFeedback');feedback.hidden=!drag?.moved||drag.mode==='pan'||drag.mode==='marquee'||drag.mode==='floating';
  if(!feedback.hidden){const delta=Math.round((drag.lastDx??0)/drag.ppd),range=groupDateRange(drag.originals.map(o=>state.events.find(e=>e.id===o.id)).filter(Boolean));feedback.textContent=drag.mode==='layout'?'调整上下位置 · 日期保持不变':`${drag.mode.startsWith('resize')?'调整起止日期':'日期整体平移'} ${delta>=0?'+':''}${delta} 天 · ${range}`;}
  $('#zoomText').textContent=Math.round(view.ppd/7*100)+'%';$('#empty').hidden=!!state.events.length||!!state.groups.length;syncDateUI();styleEditableControls();save();renderFloatingLabels();refreshFloating();refreshElementList();
}
function syncDateUI(){
  const e=currentEvent();
  if(e){syncEventDateFields($('#editor'),e);$('#toolTarget').textContent='添加到：'+displayTitle(e);}
  if(selected?.kind==='multi'){const range=$('#batchRange');if(range)range.textContent=groupDateRange(state.events.filter(e=>selected.ids.includes(e.id)));}
  if(selected?.kind==='group'){
    const range=$('#groupDateRange');if(range)range.textContent=groupDateRange(state.events.filter(e=>e.group===selected.id));
  }
}
function currentEvent(){return selected?.kind==='event'?state.events.find(e=>e.id===selected.id):null;}
function select(selection){
  selected=selection;$('#welcome').hidden=true;$('#panel').classList.toggle('open',true);
  const e=currentEvent();$('#toolTarget').textContent=selection?.kind==='multi'?`已选 ${selection.ids.length} 个节点 · 右侧批量编辑`:e?'添加到：'+e.title:'添加为新节点';
  editor();render();
}
function editor(){
  if(selected?.kind==='all'){allEditor();return;}
  if(selected?.kind==='floating'){floatingEditor();return;}
  if(!selected){$('#panelTitle').textContent='全部元素';$('#editor').replaceChildren();return;}
  if(selected?.kind==='multi'){batchEditor();return;}
  if(selected?.kind==='group'){groupEditor();return;}
  const e=currentEvent();$('#panelTitle').textContent=e?'编辑节点':'元素详情';
  if(!e){$('#editor').replaceChildren();return;}
  $('#editor').innerHTML=`<div class="field"><label>元素类型</label><select data-field="type"><option value="milestone" ${e.type==='milestone'?'selected':''}>◆ 里程碑 · 单一时间节点</option><option value="period" ${e.type==='period'?'selected':''}>━ 时间段 · 起止时间</option></select></div>
  <div class="field"><label>标题</label><textarea data-field="title">${esc(e.title)}</textarea></div>
  <div class="field"><label>项目图标</label><select id="eventIcon">${PROJECT_ICONS.map(icon=>`<option value="${icon}" ${e.icon===icon?'selected':''}>${icon||'无图标'}</option>`).join('')}</select></div><div class="field date-settings"><label class="checkbox-label"><input type="checkbox" id="showDate" ${e.showDate!==false?'checked':''}>在元素标题中显示日期</label><div class="field" style="margin-top:12px"><label>日期位置</label><select data-field="datePosition" ${e.showDate===false?'disabled':''}>${[['left','左侧'],['right','右侧'],['top','上侧'],['bottom','下侧']].map(([value,label])=>`<option value="${value}" ${(e.datePosition||'left')===value?'selected':''}>${label}</option>`).join('')}</select></div><div id="titlePreview" class="title-preview">${esc(displayTitle(e))}</div></div>
  <div class="field"><label>描述 / 备注</label><textarea data-field="description" placeholder="记录背景与进展…">${esc(e.description)}</textarea></div>
  <div class="row"><div class="field"><label>开始日期</label><input type="date" data-field="start" value="${e.start}"></div>${e.type==='period'?`<div class="field"><label>结束日期</label><input type="date" data-field="end" value="${e.end}"></div>`:''}</div>
  <div class="field"><label>所属分组</label><select data-field="group"><option value="">不分组</option>${state.groups.map(g=>`<option value="${esc(g.id)}" ${e.group===g.id?'selected':''}>${esc(g.name)}</option>`).join('')}</select></div>
  ${e.type==='period'?`<div class="section-title">进度条</div><div class="field" style="margin-top:14px"><label class="checkbox-label"><input type="checkbox" id="showProgress" ${e.showProgress?'checked':''}>显示时间段进度条</label></div><div class="row"><div class="field"><label>完成度（%）</label><input type="number" data-field="progress" min="0" max="100" step="1" value="${e.progress??0}" ${e.showProgress?'':'disabled'}></div><div class="field"><label>进度条颜色</label><input type="color" data-field="progressColor" value="${e.progressColor||'#4472c4'}" ${e.showProgress?'':'disabled'}></div></div><p class="help">完成度手动填写，不随日期自动增长。</p>`:''}
  <div class="section-title">项目跟踪</div><div class="row" style="margin-top:14px"><div class="field"><label class="checkbox-label"><input id="showStatus" type="checkbox" ${e.showStatus?'checked':''}>显示状态</label><select data-field="status" ${e.showStatus?'':'disabled'}>${statusOptions(e.status)}</select></div><div class="field"><label class="checkbox-label"><input id="showOwner" type="checkbox" ${e.showOwner?'checked':''}>显示负责人</label><input ${e.showOwner?'':'disabled'} data-field="owner" maxlength="80" value="${esc(e.owner)}" placeholder="未分配"></div></div>
  <div class="field"><label class="checkbox-label"><input type="checkbox" id="positionLock" ${e.locked?'checked':''}>锁定上下位置</label><p class="help">锁定后可用 Shift 拖动日期，紧凑排版会保留其纵向位置。</p></div>
  <div class="section-title">附件与内容</div><div class="attachment-tools"><button id="editImage">▧ ${e.image?'替换图片':'添加图片'}</button><button id="editLink">↗ ${e.url?'编辑链接':'插入链接'}</button></div>
  ${e.image?`<img id="nodeImagePreview" class="image-preview" loading="lazy" decoding="async" src="${e.imageThumb||e.image}" alt="节点图片"><button id="removeImage" class="small danger">移除图片</button>`:''}
  ${e.url?`<div class="link-preview"><a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.url)}</a><button id="removeLink" class="small danger">移除</button></div>`:''}
  <div class="section-title">外观与位置</div><div class="row" style="margin-top:15px"><div class="field"><label>标签颜色</label><input type="color" data-field="color" value="${e.color}"></div><div class="field"><label>文字颜色</label><input type="color" data-field="textColor" value="${e.textColor}"></div></div>
  <div class="field"><label>位置</label><div class="side-toggle"><button data-side="-1" class="${e.side<0?'active':''}">↑ 上方</button><button data-side="1" class="${e.side>0?'active':''}">↓ 下方</button></div></div>
  <div class="row"><div class="field"><label>标签样式</label><select data-field="design"><option value="label" ${e.design==='label'?'selected':''}>标注卡片</option><option value="round" ${e.design==='round'?'selected':''}>圆角胶囊</option></select></div><div class="field"><label>文字对齐</label><select data-field="align">${[['left','左对齐'],['center','居中'],['right','右对齐']].map(a=>`<option value="${a[0]}" ${e.align===a[0]?'selected':''}>${a[1]}</option>`).join('')}</select></div></div>
  <div class="field"><label>标签大小 · ${e.scale.toFixed(2)}</label><input type="range" min="0.6" max="1.8" step="0.05" data-field="scale" value="${e.scale}"></div>
  <div class="field"><label>标签</label><input data-field="tags" value="${esc(e.tags)}" placeholder="例如：交付、重要"></div>
  <div class="actions"><button id="duplicate">▣ 复制节点</button><button id="delete" class="danger">删除节点</button></div>`;
  $('#eventIcon').onchange=ev=>{snapshot();e.icon=ev.target.value;render();};
  $('#editor').querySelectorAll('[data-field]').forEach(el=>el.onchange=()=>{
    const key=el.dataset.field,value=['scale','progress'].includes(key)?Number(el.value):key==='owner'?el.value.trim():el.value;
    if(key==='progress'&&(!Number.isFinite(value)||value<0||value>100)){toast('完成度必须在 0 至 100 之间');el.value=e.progress??0;return;}
    if(key==='title'&&!value.trim()){toast('标题不能为空');el.value=e.title;return;}
    if(key==='type'){snapshot();e.type=value;e.end=value==='period'?date(day(e.start)+7):'';select(selected);return;}
    const start=key==='start'?value:e.start,end=key==='end'?value:e.end;
    if((key==='start'||key==='end')&&(!start||e.type==='period'&&!end||end&&day(end)<day(start))){toast('请填写有效的起止日期');el.value=e[key];return;}
    snapshot();e[key]=value;if(key==='group'){e.manual=false;e.locked=false;if(value){const g=state.groups.find(g=>g.id===value);e.side=g.side;g.collapsed=false;}}
    select(selected);
  });
  $('#editor').querySelectorAll('[data-side]').forEach(el=>el.onclick=()=>{
    if(e.locked||state.groups.find(g=>g.id===e.group)?.locked){toast('请先解除位置锁定');return;}snapshot();e.side=Number(el.dataset.side);e.manual=false;
    if(e.group){const g=state.groups.find(g=>g.id===e.group);g.side=e.side;state.events.filter(v=>v.group===g.id).forEach(v=>v.side=g.side);}
    select(selected);
  });
  if($('#showProgress'))$('#showProgress').onchange=ev=>{snapshot();e.showProgress=ev.target.checked;select(selected);};
  $('#positionLock').onchange=ev=>{snapshot();setEventLocks([e],ev.target.checked);select(selected);};
  $('#showDate').onchange=ev=>{snapshot();e.showDate=ev.target.checked;select(selected);};
  $('#showStatus').onchange=ev=>{snapshot();e.showStatus=ev.target.checked;select(selected);};
  $('#showOwner').onchange=ev=>{snapshot();e.showOwner=ev.target.checked;select(selected);};
  $('#editImage').onclick=()=>openContent('image');$('#editLink').onclick=()=>openContent('link');
  if($('#nodeImagePreview'))$('#nodeImagePreview').onclick=()=>showImage(e.id);
  if($('#removeImage'))$('#removeImage').onclick=()=>{snapshot();e.image='';e.imageThumb='';select(selected);};
  if($('#removeLink'))$('#removeLink').onclick=()=>{snapshot();e.url='';select(selected);};
  $('#duplicate').onclick=()=>{snapshot();const copy={...e,id:crypto.randomUUID(),title:e.title+'（副本）',manual:false,locked:false};state.events.push(copy);select({kind:'event',id:copy.id});};
  $('#delete').onclick=()=>{snapshot();state.events=state.events.filter(v=>v.id!==e.id);select(null);};
  installColorPalettes($('#editor'));
}
function groupEditor(){
  const g=state.groups.find(g=>g.id===selected.id);if(!g){select(null);return;}
  $('#panelTitle').textContent='编辑分组';const count=state.events.filter(e=>e.group===g.id).length;
  $('#editor').innerHTML=`<div class="selection-caption">▤ 仅选中此分组 · ${count} 个成员</div><div class="field"><label>分组日期范围</label><div id="groupDateRange" class="title-preview">${esc(groupDateRange(state.events.filter(e=>e.group===g.id)))}</div></div><div class="field"><label>分组名称</label><input id="groupName" value="${esc(g.name)}"></div><div class="field"><label>分组位置</label><select id="groupSide"><option value="-1" ${g.side<0?'selected':''}>时间轴上方</option><option value="1" ${g.side>0?'selected':''}>时间轴下方</option></select></div><div class="section-title">分组背景</div><div class="field" style="margin-top:14px"><label>背景颜色</label><input type="color" id="groupColor" value="${groupStyle(g).color}"></div><div class="field"><label>背景透明度 · <span id="groupTransparencyValue">${Math.round((1-groupStyle(g).opacity)*100)}%</span></label><input type="range" id="groupTransparency" min="0" max="100" step="1" value="${Math.round((1-groupStyle(g).opacity)*100)}"><p class="help">0% 完全不透明，100% 完全透明，仅改变分组背景。</p></div><p class="help">拖动分组调整上下位置，Shift＋拖动只修改成员日期。点击成员标签可单独编辑。</p><div class="attachment-tools"><button id="groupMilestone">＋ 里程碑</button><button id="groupPeriod">＋ 时间段</button></div><div class="field"><label class="checkbox-label"><input type="checkbox" id="groupLock" ${g.locked?'checked':''}>锁定分组上下位置</label></div><div class="attachment-tools"><button id="foldGroup">${g.collapsed?'展开分组':'折叠分组'}</button><button id="compactGroup">收紧此分组</button></div><div class="actions"><button id="dissolveGroup" class="danger">解散分组，保留成员</button></div>`;
  for(const [id,key,convert] of [['groupColor','color',value=>value],['groupTransparency','opacity',value=>1-Number(value)/100]]){
    const input=$('#'+id);let editing=false;
    const update=ev=>{if(!editing){snapshot();editing=true;}g[key]=convert(ev.target.value);const label=$('#groupTransparencyValue');if(label)label.textContent=Math.round((1-groupStyle(g).opacity)*100)+'%';render();};
    input.oninput=update;input.onchange=ev=>{update(ev);editing=false;};input.onpointerdown=()=>editing=false;
  }
  $('#groupName').onchange=ev=>{snapshot();g.name=ev.target.value.trim()||'未命名分组';select(selected);};
  $('#groupSide').onchange=ev=>{if(g.locked||state.events.some(e=>e.group===g.id&&e.locked)){toast('请先解除分组及成员的位置锁定');ev.target.value=g.side;return;}snapshot();g.side=Number(ev.target.value);g.manual=false;state.events.filter(e=>e.group===g.id).forEach(e=>e.side=g.side);select(selected);};
  $('#groupMilestone').onclick=()=>add(undefined,'milestone',g.id);$('#groupPeriod').onclick=()=>add(undefined,'period',g.id);
  $('#foldGroup').onclick=()=>toggleGroup(g.id);
  $('#groupLock').onchange=ev=>{snapshot();setGroupLock(g,ev.target.checked);select(selected);};
  $('#compactGroup').onclick=()=>{snapshot();if(!g.locked&&!state.events.some(e=>e.group===g.id&&e.locked))g.manual=false;state.events.filter(e=>e.group===g.id&&!e.locked&&!g.locked).forEach(e=>e.manual=false);select(selected);};
  $('#dissolveGroup').onclick=()=>{snapshot();state.events.forEach(e=>{if(e.group===g.id)e.group='';});state.groups=state.groups.filter(v=>v.id!==g.id);select(null);};
  installColorPalettes($('#editor'));
}
function setEventLocks(events,locked){
  for(const e of events){
    if(locked){const p=computed.positions.get(e.id);e.manual=true;if(p){e.offset=p.offset;e.localOffset=p.localTop;}
      if(e.group){const g=state.groups.find(g=>g.id===e.group),box=computed.boxes.get(e.group);if(g&&box)g.lockBase=box.top;}
    }
    e.locked=locked;
  }
}
function setGroupLock(group,locked){
  const box=computed.boxes.get(group.id);
  if(locked&&box){group.manual=true;group.offset=box.top;group.lockBase=box.top;
    for(const e of state.events.filter(e=>e.group===group.id)){const p=computed.positions.get(e.id);if(p){e.manual=true;e.offset=p.offset;e.localOffset=p.localTop;}}
  }
  group.locked=locked;
}
function toggleGroup(id){const g=state.groups.find(g=>g.id===id);if(!g)return;snapshot();g.collapsed=!g.collapsed;select({kind:'group',id});}
function batchEditor(){
  const ids=selectedIds(selected),events=state.events.filter(e=>ids.includes(e.id));
  $('#panelTitle').textContent=`批量编辑 · ${events.length} 个节点`;
  $('#editor').innerHTML=`<div class="selection-caption">Ctrl／⌘ 点击增减选择；拖动任一选中节点可整体调整。</div>
  <div class="field"><label>所选日期范围</label><div id="batchRange" class="title-preview">${esc(groupDateRange(events))}</div></div>
  <div class="batch-list">${events.map(e=>`<div>${esc(e.title)}</div>`).join('')}</div>
  <div class="section-title">批量修改</div><div class="field" style="margin-top:15px"><label>状态</label><select id="batchStatus">${statusOptions('',true)}</select></div>
  <div class="field"><label class="checkbox-label"><input id="batchOwnerApply" type="checkbox">修改负责人（留空可清除）</label><input id="batchOwner" placeholder="负责人姓名" maxlength="80"></div>
  <div class="field"><label>分组</label><select id="batchGroup"><option value="__keep">保持原分组</option><option value="">移出分组</option>${state.groups.map(g=>`<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('')}</select></div>
  <div class="field"><label>日期整体平移（天，负数表示提前）</label><input id="batchDays" type="number" min="-3650" max="3650" step="1" value="0"></div>
  <div class="field"><label>标题日期显示</label><select id="batchShowDate"><option value="keep">保持原设置</option><option value="show">全部显示</option><option value="hide">全部隐藏</option></select></div>
  <div class="row"><div class="field"><label>状态显示</label><select id="batchShowStatus"><option value="keep">保持原设置</option><option value="show">显示</option><option value="hide">隐藏</option></select></div><div class="field"><label>负责人显示</label><select id="batchShowOwner"><option value="keep">保持原设置</option><option value="show">显示</option><option value="hide">隐藏</option></select></div></div>
  <div class="field"><label>日期位置</label><select id="batchDatePosition"><option value="keep">保持原设置</option><option value="left">左侧</option><option value="right">右侧</option><option value="top">上侧</option><option value="bottom">下侧</option></select></div>
  <button id="batchTypography">Aa 所选节点文字属性</button><button class="primary" id="batchApply">应用到 ${events.length} 个节点</button>
  <div class="attachment-tools"><button id="batchLock">锁定位置</button><button id="batchUnlock">解除锁定</button></div>
  <div class="attachment-tools"><button id="batchCreateGroup">将所选节点新建为分组</button></div>
  <div class="actions"><button class="danger" id="batchDelete">删除所选 ${events.length} 个节点</button></div>`;
  $('#batchTypography').onclick=openFormat;
  $('#batchApply').onclick=()=>{
    const days=Number($('#batchDays').value);if(!Number.isInteger(days)||Math.abs(days)>3650){toast('平移天数需为 -3650 至 3650 的整数');return;}
    const patch={days};if($('#batchStatus').value)patch.status=$('#batchStatus').value;
    if($('#batchOwnerApply').checked)patch.owner=$('#batchOwner').value.trim();
    if($('#batchGroup').value!=='__keep')patch.group=$('#batchGroup').value;
    if($('#batchShowDate').value!=='keep')patch.showDate=$('#batchShowDate').value==='show';
    if($('#batchShowStatus').value!=='keep')patch.showStatus=$('#batchShowStatus').value==='show';
    if($('#batchShowOwner').value!=='keep')patch.showOwner=$('#batchShowOwner').value==='show';
    if($('#batchDatePosition').value!=='keep')patch.datePosition=$('#batchDatePosition').value;
    if(!days&&Object.keys(patch).length===1){toast('请先选择要修改的字段');return;}
    snapshot();applyBatch(state,ids,patch);select(selected);toast('已批量更新，可按 Ctrl＋Z 撤销');
  };
  $('#batchLock').onclick=()=>{snapshot();setEventLocks(events,true);select(selected);};
  $('#batchUnlock').onclick=()=>{snapshot();setEventLocks(events,false);select(selected);};
  $('#batchCreateGroup').onclick=()=>newGroup();
  $('#batchDelete').onclick=()=>{snapshot();const removed=new Set(ids);state.events=state.events.filter(e=>!removed.has(e.id));select(null);toast('已删除所选节点，可按 Ctrl＋Z 恢复');};
}

function makeEvent(d,type='milestone',group='',placement=null){
  const e={id:crypto.randomUUID(),type,title:type==='period'?'新的时间段':'新的里程碑',start:date(d??view.start+stage.clientWidth/view.ppd/2),end:type==='period'?date((d??view.start+stage.clientWidth/view.ppd/2)+14):'',description:'',group,side:state.groups.find(g=>g.id===group)?.side??-1,offset:60,manual:false,color:'#628c56',textColor:'#ffffff',scale:1,align:'center',design:'label',tags:'',image:'',url:'',note:false,showDate:true,datePosition:'left',dateTitleVersion:1,textStyles:{},showProgress:false,progress:0,progressColor:'#4472c4',status:'pending',owner:'',showStatus:false,showOwner:false,locked:false};
  if(placement){e.side=state.groups.find(g=>g.id===group)?.side??placement.side;e.manual=true;e.offset=placement.offset;e.localOffset=placement.localOffset??25;}
  return e;
}
function add(d,type='milestone',group='',placement=null){snapshot();const containing=state.groups.find(g=>g.id===group);if(containing)containing.collapsed=false;const e=makeEvent(d,type,group,placement);state.events.push(e);select({kind:'event',id:e.id});$('#editor textarea').focus();}
function newGroup(placement=null){snapshot();const g={id:crypto.randomUUID(),name:'新分组',side:placement?.side??-1,manual:!!placement,offset:placement?.offset??20,anchor:placement?date(placement.day):date(view.start+stage.clientWidth/view.ppd/2)};state.groups.push(g);if(!placement)applyBatch(state,selectedIds(selected),{group:g.id});select({kind:'group',id:g.id});$('#groupName').focus();}
function history(from,to){pendingChange=null;pendingVersionId=null;lastCaptureId=null;if(!from.length)return;pushHistory(to,JSON.stringify(state));const tags=state.revisions.filter(r=>r.kind==='tag');state=normalize(JSON.parse(from.pop()));state.revisions=retainRevisions([...new Map([...state.revisions,...tags].map(r=>[r.id,r])).values()]);select(null);}
function zoom(f,anchor=stage.clientWidth/2){Object.assign(view,zoomView(view,f,anchor));render();}
function fit(){view.panY=0;stage.scrollTop=0;if(!state.events.length){render();return;}const ds=state.events.flatMap(e=>[day(e.start),day(e.end||e.start)]),min=Math.min(...ds),max=Math.max(...ds);view.ppd=Math.min(15,Math.max(.6,(stage.clientWidth-200)/Math.max(30,max-min)));view.start=min-100/view.ppd;render();}
function compact(){view.panY=0;snapshot();for(const e of state.events){if(e.locked||state.groups.find(g=>g.id===e.group)?.locked)continue;e.manual=false;e.offset=60;e.localOffset=25;}for(const g of state.groups){if(g.locked||state.events.some(e=>e.group===g.id&&e.locked))continue;g.manual=false;g.offset=20;}select(null);stage.scrollTop=0;toast('已紧凑排版，保留锁定位置');}
$('#new').onclick=$('#welcomeNew').onclick=()=>add();$('#newPeriod').onclick=()=>add(undefined,'period');$('#newGroup').onclick=()=>newGroup();
$('#close').onclick=()=>select(null);$('#autoLayout').onclick=compact;$('#undo').onclick=()=>history(undo,redo);$('#redo').onclick=()=>history(redo,undo);
$('#projectTitle').onchange=ev=>{snapshot();state.title=ev.target.value.trim()||'未命名时间轴';save();};
$('#foldAll').onclick=()=>{snapshot();const collapse=state.groups.some(g=>!g.collapsed);state.groups.forEach(g=>g.collapsed=collapse);select(null);};
$('#lockSelection').onclick=()=>{const events=state.events.filter(e=>selectedIds(selected).includes(e.id));if(selected?.kind==='group'){const g=state.groups.find(g=>g.id===selected.id);snapshot();setGroupLock(g,!g.locked);select(selected);}else if(events.length){snapshot();setEventLocks(events,!events.every(e=>e.locked));select(selected);}else toast('请先选择节点或分组');};
$('#plus').onclick=()=>zoom(1.3);$('#minus').onclick=()=>zoom(1/1.3);$('#fit').onclick=fit;
svg.addEventListener('selectstart',ev=>ev.preventDefault());
svg.addEventListener('dragstart',ev=>ev.preventDefault());
svg.addEventListener('wheel',ev=>{
  const intent=wheelIntent(ev);if(drag)endDrag();hideContextMenu();
  // Let the browser perform native page zoom for Ctrl/Cmd + wheel.
  if(intent==='page')return;
  ev.preventDefault();
  if(intent==='scroll'){stage.scrollTop+=ev.deltaY||ev.deltaX;return;}
  const delta=(ev.deltaY||ev.deltaX)*(ev.deltaMode===1?16:ev.deltaMode===2?stage.clientHeight:1);
  if(delta)zoom(Math.exp(-Math.max(-160,Math.min(160,delta))*.002),pointerX(ev)-cssRect(svg).left);
},{passive:false});
svg.addEventListener('dblclick',ev=>{const floating=ev.target.closest('[data-floating]');if(floating){editFloatingText(floating.dataset.floating);return;}if(!resolveSelection(ev.target)){const x=pointerX(ev)-cssRect(svg).left;add(view.start+x/view.ppd);}});
svg.addEventListener('pointerdown',ev=>{
  if(ev.button!==0)return;
  const memberHit=resolveSelection(ev.target);
  if(canvasTool==='select'&&memberHit?.kind!=='event'&&!ev.target.closest('[data-floating]')){startMarquee(ev);return;}
  if(selected?.kind==='group'&&memberHit?.kind==='event'&&!ev.shiftKey&&!ev.ctrlKey&&!ev.metaKey){ev.preventDefault();toggleGroupMember(memberHit.id);return;}
  if(ev.target.closest('a'))return;
  const floating=ev.target.closest('[data-floating]');if(floating){startFloatingDrag(ev,floating);return;}
  if(ev.target.closest('[data-inline]')&&!ev.shiftKey&&!ev.ctrlKey&&!ev.metaKey){ev.preventDefault();beginInline(ev.target);return;}
  ev.preventDefault();hideContextMenu();window.getSelection()?.removeAllRanges();
  const toggle=ev.target.closest('[data-toggle-group]');if(toggle){toggleGroup(toggle.dataset.toggleGroup);return;}
  const hit=resolveSelection(ev.target),additive=ev.ctrlKey||ev.metaKey;
  if(additive&&hit?.kind==='event'){select(toggleSelection(selected,hit.id));return;}
  const preserveMulti=hit?.kind==='event'&&selected?.kind==='multi'&&selected.ids.includes(hit.id);
  const seedIds=additive?selectedIds(selected):[];
  if(!preserveMulti)select(hit);
  const group=hit?.kind==='group'?state.groups.find(g=>g.id===hit.id):null;
  const events=group?state.events.filter(e=>e.group===group.id):state.events.filter(e=>selectedIds(selected).includes(e.id));
  const locked=!!group?.locked||events.some(e=>e.locked||state.groups.find(g=>g.id===e.group)?.locked);
  const handle=ev.target.closest('[data-resize]')?.dataset.resize??'';
  const mode=dragMode({shift:ev.shiftKey,handle,locked,marquee:additive&&!hit,hasElement:!!hit});
  if(!mode){toast('位置已锁定；Shift＋拖动仍可修改日期');return;}
  const rect=cssRect(svg);
  drag={mode,x:pointerX(ev),y:pointerY(ev),start:view.start,panY:view.panY,ppd:view.ppd,axis:view.axis,group:group?structuredClone(group):null,
    box:group?{...computed.boxes.get(group.id)}:null,event:hit?.kind==='event'?state.events.find(e=>e.id===hit.id):null,
    originals:events.map(e=>({...structuredClone(e),actual:computed.positions.has(e.id)?{...computed.positions.get(e.id)}:null})),seedIds,
    origin:{x:pointerX(ev)-rect.left,y:pointerY(ev)-rect.top},moved:false,lastDx:0};
  if(mode.startsWith('resize')){select({kind:'event',id:hit.id});drag.originals=drag.originals.filter(e=>e.id===hit.id);}
  svg.classList.add(mode==='pan'?'panning':'dragging-element');svg.setPointerCapture(ev.pointerId);
});
svg.addEventListener('pointermove',ev=>{
  if(drag?.mode==='floating'){moveFloating(ev);return;}
  if(!drag)return;ev.preventDefault();const dx=pointerX(ev)-drag.x,dy=pointerY(ev)-drag.y;
  if(!drag.moved&&Math.hypot(dx,dy)<4)return;
  if(!drag.moved&&!['pan','marquee'].includes(drag.mode))snapshot();drag.moved=true;drag.lastDx=dx;
  if(drag.mode==='marquee'){
    const x=drag.origin.x+dx,y=drag.origin.y+dy;
    drag.rect={left:Math.min(drag.origin.x,x),right:Math.max(drag.origin.x,x),top:Math.min(drag.origin.y,y),bottom:Math.max(drag.origin.y,y)};
    selected=drag.decorations?rectangleSelection(drag.rect,drag.seedIds,drag.seedGroups||[],drag.seedFloating||[]):selectionFromIds([...new Set([...drag.seedIds,...hitsInRectangle(drag.rect,computed.positions,view.axis)])]);
  }else if(drag.mode==='pan')Object.assign(view,panView(drag,dx,dy));
  else if(drag.mode==='date'||drag.mode.startsWith('resize')){
    const delta=Math.round(dx/drag.ppd);
    for(const o of drag.originals){const e=state.events.find(e=>e.id===o.id);if(drag.mode==='date')shiftEventDates(e,o,delta);else resizeDates(e,o,delta,drag.mode==='resize-start'?'start':'end');}
    if(drag.group&&!drag.originals.length){const g=state.groups.find(g=>g.id===drag.group.id);g.anchor=date((drag.group.anchor?day(drag.group.anchor):view.start+drag.box.left/drag.ppd)+delta);}
  }else if(drag.group){
    const g=state.groups.find(g=>g.id===drag.group.id),b=drag.box,signed=b.side*(b.top+b.bottom)/2+dy;
    g.side=signed<0?-1:1;g.manual=true;g.offset=Math.max(20,Math.abs(signed)-(b.bottom-b.top)/2);
    for(const e of state.events.filter(e=>e.group===g.id))e.side=g.side;
  }else{
    for(const o of drag.originals){if(!o.actual)continue;const e=state.events.find(e=>e.id===o.id),signed=o.actual.side*o.actual.offset+dy;
      e.side=signed<0?-1:1;e.offset=Math.max(20,Math.min(100000,Math.abs(signed)));e.manual=true;
      const group=state.groups.find(g=>g.id===e.group);if(group&&e.side!==group.side)e.group='';
      if(group&&e.group){const box=computed.boxes.get(group.id);e.localOffset=Math.max(25,Math.abs(signed)-box.top-o.actual.height/2);}
    }
  }
  render();
});
function endDrag(){
  svg.classList.remove('panning','dragging-element');if(!drag)return;
  const changed=drag.moved,oldAxis=view.axis,isElement=!['pan','marquee'].includes(drag.mode);drag=null;
  if(changed){select(selected);if(isElement)stage.scrollTop+=view.axis-oldAxis;}
  $('#dragFeedback').hidden=true;
}
svg.addEventListener('pointerup',endDrag);svg.addEventListener('pointercancel',endDrag);
svg.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){const toggle=ev.target.closest('[data-toggle-group]');if(toggle){ev.preventDefault();toggleGroup(toggle.dataset.toggleGroup);return;}const target=resolveSelection(ev.target);if(target){ev.preventDefault();select(target);}}});
function downloadBlob(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
async function projectBundle(){await versionWrites;const exported=structuredClone(state);exported.versionSnapshots={};for(const r of exported.revisions){if(!r.snapshotId)continue;const payload=failedSnapshotWrites.get(r.snapshotId)||await readVersionSnapshot(r.snapshotId);if(payload)exported.versionSnapshots[r.snapshotId]=payload;else if(r.snapshotId&&r.snapshotStatus==='ready')throw Error('历史快照无法读取，请重试或使用立即导出保存当前项目');}return exported;}
async function exportBackup(history=true){try{const exported=history?await projectBundle():structuredClone(state);downloadBlob(new Blob([JSON.stringify(exported,null,2)],{type:'application/json'}),history?'osa-timeline.json':'osa-timeline-emergency.json');toast(history?'已导出项目及可用历史快照':'已导出当前项目（不含历史快照）');}catch(error){toast('导出失败：'+error.message);}}

$('#export').onclick=()=>exportBackup();$('#emergencyExport').onclick=()=>exportBackup(!saveFailed);$('#retrySave').onclick=async()=>{for(const [id,payload]of failedSnapshotWrites){try{await writeVersionSnapshot(id,payload);failedSnapshotWrites.delete(id);const r=state.revisions.find(r=>r.snapshotId===id);if(r)r.snapshotStatus='ready';}catch{}}lastSavedText=null;save();};
let incomingImport=null,importBaseline='';
$('#import').onclick=()=>{pendingLocalOpen=null;$('#importMode').disabled=false;$('#file').click();};$('#file').onchange=async ev=>{const f=ev.target.files[0];if(!f)return;try{if(f.size>80*1024*1024)throw Error('文件超过 80 MB');incomingImport=JSON.parse(await f.text());importBaseline=JSON.stringify(state);previewImport();$('#importDialog').showModal();}catch(error){toast('导入失败：'+(error.message||'请选择有效 JSON'));}ev.target.value='';};
function previewImport(){const check=inspectImport(state,incomingImport);if(!valid(incomingImport))check.errors.push('文件结构或元素属性不合法，请使用 OSA 导出的 JSON');const removed=['events','groups','floatingLabels'].reduce((n,k)=>n+(state[k]||[]).filter(e=>!(Array.isArray(incomingImport?.[k])?incomingImport[k]:[]).some(v=>v?.id===e.id)).length,0);$('#importPreview').innerHTML=`<div class="import-summary">新增 ${check.rows.filter(r=>r.action==='新增').length} · 覆盖 ${check.rows.filter(r=>r.action==='覆盖').length} · 异常 ${check.errors.length} · 重复警告 ${check.warnings.length}${$('#importMode').value==='replace'?` · 移除 ${removed}`:''}</div>${[...check.errors,...check.warnings].map(s=>`<p class="import-warning">${esc(s)}</p>`).join('')}<div class="import-rows">${check.rows.map(r=>`<p><b>${r.action}</b> ${esc(r.title)} <small>${esc(r.id)}</small></p>`).join('')}</div>`;$('#applyImport').disabled=!!check.errors.length;}
$('#importMode').onchange=previewImport;$('#closeImport').onclick=()=>{pendingLocalOpen=null;$('#importDialog').close();};
$('#applyImport').onclick=async()=>{const button=$('#applyImport');button.disabled=true;try{if(JSON.stringify(state)!==importBaseline)throw Error('项目已变更，请关闭后重新选择导入文件');const check=inspectImport(state,incomingImport);if(check.errors.length||!valid(incomingImport))throw Error('请先修复导入异常');const incoming=normalize(structuredClone(incomingImport));const beforeId=crypto.randomUUID(),backup={id:beforeId,snapshotId:beforeId,snapshotStatus:'ready',kind:'tag',name:'导入前备份',time:new Date().toISOString(),version:state.projectInfo.version||'',summary:'应用导入前自动保留'};await writeVersionSnapshot(beforeId,snapshotDocument(state));
// Remap imported snapshot IDs so existing recoverable versions cannot be overwritten.
const remap=new Map();for(const r of incoming.revisions){if(r.snapshotId)remap.set(r.snapshotId,crypto.randomUUID());}for(const r of incoming.revisions){const old=r.snapshotId,payload=incoming.versionSnapshots?.[old];r.id=crypto.randomUUID();r.snapshotId=remap.get(old)||r.id;r.snapshotStatus='error';if(payload&&valid(payload)){const restored=snapshotDocument(payload);restored.revisions=(restored.revisions||[]).map(v=>({...v,snapshotId:remap.get(v.snapshotId)||crypto.randomUUID(),snapshotStatus:remap.has(v.snapshotId)?v.snapshotStatus:'error'}));await writeVersionSnapshot(r.snapshotId,restored);r.snapshotStatus='ready';}}
delete incoming.versionSnapshots;const next=normalize(mergeImport(state,incoming,$('#importMode').value));next.revisions=retainRevisions([...state.revisions,...incoming.revisions,backup].filter((r,i,a)=>a.findIndex(v=>v.id===r.id)===i));if(!valid(next)||next.events.some(e=>e.group&&!next.groups.some(g=>g.id===e.group)))throw Error('合并后数据无效或存在缺失分组');if(JSON.stringify(state)!==importBaseline)throw Error('项目已变更，未应用导入');snapshot();state=next;if(pendingLocalOpen){localFileHandle=pendingLocalOpen.handle;localFileName=pendingLocalOpen.name;localFileText=pendingLocalOpen.text;localSavedAt='';localFileBaseline=projectFingerprint(state);pendingLocalOpen=null;undo=[];redo=[];pendingChange=null;lastCaptureId=null;}$('#importMode').disabled=false;$('#importDialog').close();select(null);fit();toast(saveFailed?'已应用到内存，请立即导出备份':'导入完成，已保留导入前版本');}catch(error){toast('未应用导入：'+error.message);}finally{button.disabled=false;}};

function groups(){
  $('#groupList').innerHTML=state.groups.map(g=>`<div class="group-row"><span>${esc(g.name)}</span><button data-edit-group="${esc(g.id)}">编辑分组</button></div>`).join('');
  $('#groupList').querySelectorAll('[data-edit-group]').forEach(el=>el.onclick=()=>{$('#groupDialog').close();select({kind:'group',id:el.dataset.editGroup});});
}
$('#groupsBtn').onclick=()=>{groups();$('#groupDialog').showModal();};
$('#groupForm').onsubmit=ev=>{ev.preventDefault();snapshot();const g={id:crypto.randomUUID(),name:ev.target.elements.namedItem('name').value.trim()||'未命名分组',side:-1,manual:false,offset:20};state.groups.push(g);ev.target.reset();$('#groupDialog').close();select({kind:'group',id:g.id});};
function openContent(mode,placement=null){
  contentPlacement=placement;contentToken++;contentMode=mode;contentTarget=currentEvent()?.id??null;const e=currentEvent();
  $('#contentTitle').textContent=mode==='image'?'添加图片':mode==='link'?'插入超链接':'添加备注';
  $('#contentTarget').textContent=e?'添加到节点：'+e.title:'将在当前视口创建一个新节点';
  $('#contentName').value=e?.title??'';$('#contentName').required=!contentTarget;$('#contentName').readOnly=!!contentTarget;
  $('#imageFields').hidden=mode!=='image';$('#linkFields').hidden=mode!=='link';$('#noteFields').hidden=mode!=='note';
  $('#imageFile').value='';$('#linkUrl').value=e?.url??'';$('#noteText').value=e?.description??'';
  $('#linkUrl').required=mode==='link';$('#noteText').required=mode==='note';$('#imageFile').required=mode==='image';
  if(e){applyControlStyle($('#contentName'),e,'title',12);applyControlStyle($('#noteText'),e,'description',14);applyControlStyle($('#linkUrl'),e,'link',12);}
  $('#contentSubmit').disabled=false;$('#contentSubmit').textContent='添加';$('#contentDialog').showModal();
}
$('#toolImage').onclick=()=>openContent('image');$('#toolLink').onclick=()=>openContent('link');$('#toolNote').onclick=()=>openContent('note');
async function readImage(file){
  if(!file||!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw Error('请选择 PNG、JPEG、WebP 或 GIF 图片');
  if(file.size>12*1024*1024)throw Error('图片请小于 12 MB');
  const url=URL.createObjectURL(file);
  try{
    const img=new Image();img.src=url;await img.decode();const ratio=Math.min(1,1000/Math.max(img.width,img.height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*ratio));canvas.height=Math.max(1,Math.round(img.height*ratio));
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/webp',.82);
    if(!safeImage(data))throw Error('图片过大，请选择更小的图片');return data;
  }finally{URL.revokeObjectURL(url);}
}
$('#contentForm').onsubmit=async ev=>{
  ev.preventDefault();const mode=contentMode,target=contentTarget,token=contentToken,button=$('#contentSubmit');button.disabled=true;button.textContent='处理中…';
  try{
    const payload={};
    if(mode==='image'){payload.image=await readImage($('#imageFile').files[0]);payload.imageThumb=await thumbnail(payload.image);}
    if(token!==contentToken||!$('#contentDialog').open)return;
    if(mode==='link'){payload.url=safeLink($('#linkUrl').value.trim());if(!payload.url)throw Error('请填写以 https:// 或 http:// 开头的链接');}
    if(mode==='note'){payload.description=$('#noteText').value.trim();payload.note=true;}
    const candidate=structuredClone(state);let e=candidate.events.find(e=>e.id===target);
    if(!e){e=makeEvent(contentPlacement?.day,'milestone',contentPlacement?.group??'',contentPlacement);e.title=$('#contentName').value.trim()||(mode==='image'?'图片':mode==='link'?'参考链接':'备注');candidate.events.push(e);}
    Object.assign(e,payload);const parent=candidate.groups.find(g=>g.id===e.group);if(parent)parent.collapsed=false;
    // Check the complete record fits before changing the live state.
    try{localStorage.setItem(storageKey,JSON.stringify(candidate));}catch{throw Error('浏览器存储空间不足，请先导出备份或移除部分图片');}
    snapshot();state=candidate;$('#contentDialog').close();select({kind:'event',id:e.id});toast('已添加');
  }catch(error){toast(error.message||'添加失败，请重试');}
  finally{if(token===contentToken){button.disabled=false;button.textContent='添加';}}
};
$('#cancelContent').onclick=()=>$('#contentDialog').close();
document.addEventListener('keydown',ev=>{
  if(ev.key==='Shift')document.body.classList.add('shift-held');
  if(ev.target.isContentEditable||/INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)||document.querySelector('dialog[open]'))return;
  if(elementShortcut(ev))return;
  const action=historyShortcut(ev);
  if(action){ev.preventDefault();endDrag();action==='undo'?history(undo,redo):history(redo,undo);}
  if(ev.key==='Escape'){hideContextMenu();select(null);}
});
document.addEventListener('keyup',ev=>{if(ev.key==='Shift')document.body.classList.remove('shift-held');});
window.addEventListener('blur',()=>{document.body.classList.remove('shift-held');endDrag();});
function installPalette(input){
  if(input.dataset.paletteInstalled)return;input.dataset.paletteInstalled='true';
  const palette=document.createElement('div');palette.setAttribute('class','color-palette');palette.setAttribute('aria-label','20 个基础颜色');
  for(const color of COLORS){const button=document.createElement('button');button.setAttribute('type','button');button.setAttribute('data-color',color);button.setAttribute('title',color.toUpperCase());button.setAttribute('aria-label','选择颜色 '+color.toUpperCase());button.setAttribute('aria-pressed',input.value.toLowerCase()===color);button.style.backgroundColor=color;button.disabled=!!input.disabled;
    button.onclick=()=>{if(input.disabled)return;input.value=color;input.oninput?.({target:input});input.onchange?.({target:input});for(const b of palette.querySelectorAll('button'))b.setAttribute('aria-pressed',b===button);};palette.append(button);
  }
  input.paletteElement=palette;input.insertAdjacentElement('afterend',palette);
}
function refreshPalette(input){if(input?.paletteElement)for(const button of input.paletteElement.querySelectorAll('button')){button.setAttribute('aria-pressed',button.dataset.color===input.value.toLowerCase());button.disabled=!!input.disabled;}}
function installColorPalettes(root){root.querySelectorAll('[type="color"]').forEach(installPalette);}
function applyControlStyle(element,item,field,size=12){
  if(!element)return;const style=textStyle(item,field,size);
  Object.assign(element.style,{fontFamily:style.family,fontSize:style.size+'px',fontWeight:style.bold?'700':'400',fontStyle:style.italic?'italic':'normal',textDecoration:style.underline?'underline':'none',color:style.color||''});
}
function styleEditableControls(){
  applyControlStyle($('#projectTitle'),state,'projectTitle',14);$('#editor').querySelectorAll('[type="color"]').forEach(refreshPalette);
  const e=currentEvent(),root=$('#editor');
  if(e){for(const [field,target,size]of [['title','title',12],['description','description',14],['owner','metadata',12],['status','metadata',12],['tags','tags',12],['start','date',12],['end','date',12],['progress','progress',12]])applyControlStyle(root.querySelector(`[data-field="${field}"]`),e,target,size);applyControlStyle($('#titlePreview'),e,'title',12);applyControlStyle(root.querySelector('.link-preview a'),e,'link',12);}
  if(selected?.kind==='group'){const g=state.groups.find(g=>g.id===selected.id);if(g){applyControlStyle($('#groupName'),g,'name',12);applyControlStyle($('#groupDateRange'),g,'range',12);}}
}
let formatSelection=null;
const FORMAT_LABELS={title:'节点标题',date:'日期文字',description:'描述／备注',metadata:'状态／负责人',tags:'标签文字',link:'超链接文字',progress:'进度百分比',name:'分组名称',range:'分组日期范围',summary:'分组统计文字',projectTitle:'项目名称'};
const defaultSize=field=>field==='description'||field==='projectTitle'?14:['date','name','range','summary'].includes(field)?10:field==='metadata'||field==='progress'?9:12;
function formatItems(){
  if(formatSelection?.kind==='all')return [...state.events.filter(e=>formatSelection.ids.includes(e.id)),...state.groups.filter(g=>formatSelection.groupIds.includes(g.id)),...state.floatingLabels.filter(e=>formatSelection.floatingIds.includes(e.id))];
  if(formatSelection?.kind==='group')return state.groups.filter(g=>g.id===formatSelection.id);
  const ids=selectedIds(formatSelection);return ids.length?state.events.filter(e=>ids.includes(e.id)):[state];
}
function formatFields(){if(formatSelection?.kind==='all')return [...TEXT_FIELDS,...GROUP_FIELDS,'projectTitle'];return formatSelection?.kind==='group'?GROUP_FIELDS:selectedIds(formatSelection).length?TEXT_FIELDS:['projectTitle'];}
function formatPreview(){
  const style=normalizeTextStyle({font:$('#fontFamily').value,size:Number($('#fontSize').value),bold:$('#fontBold').checked,italic:$('#fontItalic').checked,underline:$('#fontUnderline').checked,color:$('#fontInheritColor').checked?'':$('#fontColor').value});
  applyControlStyle($('#fontPreview'),{textStyles:{preview:style}},'preview',12);refreshPalette($('#fontColor'));
}
function loadFormat(){
  const field=$('#formatTarget').value==='all'?formatFields()[0]:$('#formatTarget').value,item=formatItems()[0],style=textStyle(item,field,defaultSize(field));
  $('#fontFamily').value=style.font;$('#fontSize').value=style.size;$('#fontBold').checked=style.bold;$('#fontItalic').checked=style.italic;$('#fontUnderline').checked=style.underline;$('#fontInheritColor').checked=!style.color;$('#fontColor').value=style.color||item.textColor||(formatSelection?.kind==='group'?groupStyle(item).text:'#22332e');formatPreview();
}
function openFormat(){
  formatSelection=selected?structuredClone(selected):null;const fields=formatFields();
  $('#formatTarget').innerHTML=fields.map(field=>`<option value="${field}">${FORMAT_LABELS[field]}</option>`).join('')+(fields.length>1?'<option value="all">以上全部文字</option>':'');$('#formatTarget').value=fields[0];
  $('#fontFamily').innerHTML=Object.entries(FONTS).map(([key,font])=>`<option value="${key}">${font.label}</option>`).join('');
  $('#formatScope').textContent=formatSelection?.kind==='all'?'应用范围：全部选中节点、分组与悬浮标签':formatSelection?.kind==='group'?'应用范围：选中分组':selectedIds(formatSelection).length?`应用范围：${selectedIds(formatSelection).length} 个选中节点`:'应用范围：项目名称（选择节点或分组可设置其文字）';
  installPalette($('#fontColor'));loadFormat();$('#formatDialog').showModal();
}
function applyFormat(reset=false){
  const target=$('#formatTarget').value,fields=target==='all'?formatFields():[target],size=Number($('#fontSize').value);
  if(!reset&&(!Number.isFinite(size)||size<8||size>48)){toast('字号需在 8 至 48 之间');return;}
  const style=normalizeTextStyle({font:$('#fontFamily').value,size,bold:$('#fontBold').checked,italic:$('#fontItalic').checked,underline:$('#fontUnderline').checked,color:$('#fontInheritColor').checked?'':$('#fontColor').value});
  snapshot();for(const item of formatItems()){item.textStyles??={};for(const field of fields){if(reset)delete item.textStyles[field];else item.textStyles[field]={...style};}}
  $('#formatDialog').close();select(selected);toast(reset?'已恢复默认文字格式':'文字格式已应用');
}
$('#formatText').onclick=openFormat;$('#closeFormat').onclick=()=>$('#formatDialog').close();$('#formatTarget').onchange=loadFormat;
for(const id of ['fontFamily','fontSize','fontBold','fontItalic','fontUnderline','fontInheritColor']){$('#'+id).oninput=formatPreview;$('#'+id).onchange=formatPreview;}
$('#fontColor').oninput=()=>{$('#fontInheritColor').checked=false;formatPreview();};$('#fontColor').onchange=$('#fontColor').oninput;
$('#formatForm').onsubmit=ev=>{ev.preventDefault();applyFormat();};$('#resetFormat').onclick=()=>applyFormat(true);
const layoutInputs={rowGap:'layoutRowGap',blockGap:'layoutBlockGap',padding:'layoutPadding',axisGap:'layoutAxisGap'};
function fillLayout(values){for(const [key,id]of Object.entries(layoutInputs))$('#'+id).value=values[key];}
$('#layoutSettings').onclick=()=>{fillLayout(normalizeLayout(state.layout));$('#layoutRepack').checked=true;$('#layoutDialog').showModal();};
$('#closeLayout').onclick=()=>$('#layoutDialog').close();
$('#layoutDialog').querySelectorAll('[data-density]').forEach(button=>button.onclick=()=>fillLayout(LAYOUT_PRESETS[button.dataset.density]));
$('#layoutForm').onsubmit=ev=>{
  ev.preventDefault();const values=Object.fromEntries(Object.entries(layoutInputs).map(([key,id])=>[key,Number($('#'+id).value)]));
  if(Object.values(values).some(v=>!Number.isFinite(v))||values.rowGap<0||values.rowGap>40||values.blockGap<0||values.blockGap>60||values.padding<0||values.padding>30||values.axisGap<8||values.axisGap>120){toast('请按提示范围填写布局间隔');return;}
  snapshot();state.layout=normalizeLayout(values);
  if($('#layoutRepack').checked){for(const e of state.events){if(e.locked||state.groups.find(g=>g.id===e.group)?.locked)continue;e.manual=false;e.offset=60;e.localOffset=25;}for(const g of state.groups){if(g.locked||state.events.some(e=>e.group===g.id&&e.locked))continue;g.manual=false;g.offset=20;}}
  $('#layoutDialog').close();select(selected);toast('全局布局间隔已更新');
};

new ResizeObserver(()=>render()).observe(stage);select(null);

const contextMenu=$('#contextMenu');
function hideContextMenu(){contextMenu.hidden=true;contextPlacement=null;}
svg.addEventListener('contextmenu',ev=>{
  if(ev.target.closest('a'))return;
  ev.preventDefault();endDrag();window.getSelection()?.removeAllRanges();
  const rect=cssRect(svg),x=pointerX(ev)-rect.left,y=pointerY(ev)-rect.top;
  const hit=resolveSelection(ev.target),member=hit?.kind==='event'?state.events.find(e=>e.id===hit.id):null;
  const groupId=hit?.kind==='group'?hit.id:member?.group??'';
  const box=groupId?computed.boxes.get(groupId):null;
  contextPlacement={day:view.start+x/view.ppd,side:y<view.axis?-1:1,offset:Math.max(25,Math.abs(y-view.axis)),group:groupId,localOffset:box?Math.max(25,Math.abs(y-view.axis)-box.top):25};
  select(null);$('#contextDate').textContent=date(contextPlacement.day)+(groupId?' · 添加到分组':'');
  contextMenu.hidden=false;
  contextMenu.style.left=Math.max(8,Math.min(pointerX(ev),pageWidth()-contextMenu.offsetWidth-8))+'px';
  contextMenu.style.top=Math.max(8,Math.min(pointerY(ev),pageHeight()-contextMenu.offsetHeight-8))+'px';
  contextMenu.querySelector('button').focus();
});
contextMenu.querySelectorAll('[data-insert]').forEach(button=>button.onclick=()=>{
  const placement=contextPlacement?{...contextPlacement}:null,kind=button.dataset.insert;hideContextMenu();if(!placement)return;
  if(kind==='milestone'||kind==='period')add(placement.day,kind,placement.group,placement);
  else if(kind==='group')newGroup(placement);
  else openContent(kind,placement);
});
contextMenu.addEventListener('keydown',ev=>{
  const buttons=[...contextMenu.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
  if(ev.key==='ArrowDown'||ev.key==='ArrowUp'){ev.preventDefault();buttons[(index+(ev.key==='ArrowDown'?1:buttons.length-1))%buttons.length].focus();}
  if(ev.key==='Escape'){ev.preventDefault();hideContextMenu();svg.focus();}
});
document.addEventListener('pointerdown',ev=>{if(!contextMenu.contains(ev.target))hideContextMenu();});
window.addEventListener('resize',hideContextMenu);stage.addEventListener('scroll',hideContextMenu);

// Canvas editing and non-modal Office-style contextual controls.
let inlineSession=null, floatingField='title';
function finishInline(cancel=false){
  if(!inlineSession)return;
  const {box,endBox,item,field,original}=inlineSession;inlineSession=null;
  const value=box.value.trim(),endValue=endBox?.value;box.remove();endBox?.remove();
  if(!cancel&&value&&(value!==original||(endBox&&endValue!==item.end))){
    if(field==='start'&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(day(value))||(endBox?(!endValue||value>endValue):(item.end&&value>item.end)))){toast('日期无效或晚于结束日期');return;}
    snapshot();item[field]=value;if(endBox)item.end=endValue;editor();render();
  }
}
function beginInline(target){
  finishInline();const hit=resolveSelection(target);if(!hit)return;
  const field=target.dataset.inline,rect=cssRect(target);
  floatingField=field;select(hit);
  const item=hit.kind==='group'?state.groups.find(g=>g.id===hit.id):currentEvent();
  const actual=field==='date'?'start':field;
  const box=document.createElement('input');box.className='inline-text-editor';box.type=field==='date'?'date':'text';box.value=item[actual];box.setAttribute('aria-label',field==='date'?'编辑开始日期':'原位编辑文字');
  Object.assign(box.style,{left:Math.max(4,rect.left-5)+'px',top:Math.max(4,rect.top-5)+'px',width:Math.min(pageWidth()-16,Math.max(180,rect.width+35))+'px'});
  applyControlStyle(box,item,field,defaultSize(field));document.body.append(box);
  inlineSession={box,item,field:actual,original:item[actual]};
  box.onkeydown=ev=>{ev.stopPropagation();if(ev.key==='Enter'&&!ev.isComposing){ev.preventDefault();finishInline();}if(ev.key==='Escape'){ev.preventDefault();finishInline(true);}};
  if(field==='date'&&item.end){
    const endBox=document.createElement('input');endBox.type='date';endBox.className='inline-text-editor';endBox.value=item.end;endBox.setAttribute('aria-label','编辑结束日期');Object.assign(endBox.style,{left:box.style.left,top:(Math.max(4,rect.top-5)+38)+'px',width:box.style.width});document.body.append(endBox);inlineSession.endBox=endBox;endBox.onkeydown=box.onkeydown;endBox.onblur=ev=>{if(ev.relatedTarget!==box)finishInline();};
  }
  box.onblur=ev=>{if(ev.relatedTarget!==inlineSession?.endBox)finishInline();};box.focus();if(box.type==='text')box.select();refreshFloating();
}
function floatingItems(){if(selected?.kind==='floating')return state.floatingLabels.filter(e=>e.id===selected.id);return selected?.kind==='group'?state.groups.filter(g=>g.id===selected.id):state.events.filter(e=>selectedIds(selected).includes(e.id));}
function floatingChange(fn){finishInline();const items=floatingItems();if(!items.length)return;snapshot();items.forEach(fn);editor();render();}
function refreshFloating(){
  const panel=document.querySelector('#officeFloat');if(!panel)return;
  const items=floatingItems();panel.hidden=!items.length||selected?.kind==='all';if(panel.hidden)return;
  const item=items[0],group=selected.kind==='group',fields=selected.kind==='floating'?['title']:group?GROUP_FIELDS:TEXT_FIELDS;
  if(!fields.includes(floatingField))floatingField=fields[0];
  const field=panel.querySelector('[data-office="field"]');field.replaceChildren(...fields.map(f=>new Option(FORMAT_LABELS[f],f)));field.value=floatingField;
  const st=textStyle(item,floatingField,defaultSize(floatingField));
  panel.querySelector('[data-office="font"]').value=st.font;panel.querySelector('[data-office="size"]').value=st.size;
  for(const key of ['bold','italic','underline'])panel.querySelector(`[data-office="${key}"]`).setAttribute('aria-pressed',st[key]);
  const color=panel.querySelector('[data-office="textColor"]');color.value=st.color||item.textColor||'#22332e';refreshPalette(color);
  const fill=panel.querySelector('[data-office="fill"]');fill.value=item.color||'#e8ede2';refreshPalette(fill);
  panel.querySelector('[data-office="opacity"]').value=Math.round((1-(Number.isFinite(item.opacity)?item.opacity:group?.75:1))*100);
  panel.querySelector('[data-office="shape"]').value=item.design||'label';
  panel.querySelector('[data-office="icon"]').value=item.icon||'';
  const anchor=selected.kind==='floating'?[...svg.querySelectorAll('[data-floating]')].find(el=>el.dataset.floating===selected.id):selected.kind==='group'?[...svg.querySelectorAll('[data-group]')].find(el=>el.dataset.group===selected.id):[...svg.querySelectorAll('[data-id]')].find(el=>el.dataset.id===items[0].id);
  const r=cssRect(anchor);if(!r){panel.hidden=true;return;}
  panel.style.left=Math.max(8,Math.min(r.left,pageWidth()-panel.offsetWidth-8))+'px';
  const preferred=r.top-panel.offsetHeight-12;
  panel.style.top=Math.max(8,Math.min(preferred>70?preferred:r.bottom+14,pageHeight()-panel.offsetHeight-8))+'px';
}
const office=document.createElement('section');office.setAttribute('id','officeFloat');office.className='office-float';office.hidden=true;office.setAttribute('aria-label','文字和形状悬浮工具栏');
office.innerHTML=`<div class="office-row"><select data-office="field" aria-label="文字对象"></select><select data-office="font" aria-label="字体">${Object.entries(FONTS).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select><select data-office="icon" aria-label="项目图标" title="项目图标">${PROJECT_ICONS.map(icon=>`<option value="${icon}">${icon||'无图标'}</option>`).join('')}</select><input data-office="size" type="number" min="8" max="48" aria-label="字号"><button data-office="grow" title="增大字号">A⁺</button><button data-office="shrink" title="减小字号">A⁻</button></div><div class="office-row"><button data-office="bold" title="加粗"><b>B</b></button><button data-office="italic" title="倾斜"><i>I</i></button><button data-office="underline" title="下划线"><u>U</u></button><details><summary>文字颜色 ▾</summary><input type="color" data-office="textColor" aria-label="文字颜色"></details><span class="office-divider"></span><details><summary>填充 ▾</summary><input type="color" data-office="fill" aria-label="背景颜色"></details><label>透明度 <input data-office="opacity" type="number" min="0" max="100" step="5">%</label><select data-office="shape" aria-label="元素形状"><option value="label">圆角矩形</option><option value="square">矩形</option><option value="round">圆润形</option></select></div>`;
document.body.append(office);installColorPalettes(office);
const control=k=>office.querySelector(`[data-office="${k}"]`);
function changeText(patch){floatingChange(item=>{item.textStyles??={};item.textStyles[floatingField]=normalizeTextStyle({...textStyle(item,floatingField,defaultSize(floatingField)),...patch});});}
control('field').onchange=ev=>{floatingField=ev.target.value;refreshFloating();};
control('font').onchange=ev=>changeText({font:ev.target.value});
control('size').onchange=ev=>{const n=Number(ev.target.value);if(n>=8&&n<=48)changeText({size:n});else refreshFloating();};
for(const key of ['bold','italic','underline'])control(key).onclick=()=>changeText({[key]:!textStyle(floatingItems()[0],floatingField)[key]});
for(const [key,delta]of [['grow',2],['shrink',-2]])control(key).onclick=()=>changeText({size:Math.max(8,Math.min(48,textStyle(floatingItems()[0],floatingField,defaultSize(floatingField)).size+delta))});
control('textColor').onchange=ev=>changeText({color:ev.target.value});
control('fill').onchange=ev=>floatingChange(item=>item.color=ev.target.value);
control('opacity').onchange=ev=>{const n=Number(ev.target.value);if(Number.isFinite(n))floatingChange(item=>item.opacity=1-Math.max(0,Math.min(100,n))/100);};
control('icon').onchange=ev=>{if(PROJECT_ICONS.includes(ev.target.value))floatingChange(item=>item.icon=ev.target.value);};
control('shape').onchange=ev=>floatingChange(item=>item.design=ev.target.value);
// Keep the edit session alive while clicking the contextual ribbon.
office.addEventListener('pointerdown',ev=>{if(ev.target.closest('button'))ev.preventDefault();});
window.addEventListener('resize',()=>{finishInline();refreshFloating();});
stage.addEventListener('scroll',()=>{finishInline();refreshFloating();});
refreshFloating();

$('#formatText').onclick=()=>{if(floatingItems().length){refreshFloating();control('font').focus();}else openFormat();};


function closeFloatingPalettes(except=null){for(const details of office.querySelectorAll('details'))if(details!==except)details.open=false;}
function outsideEditorPointer(ev){
  const session=inlineSession;
  if(session&&ev.target!==session.box&&ev.target!==session.endBox&&!office.contains(ev.target))finishInline();
  if(!office.contains(ev.target))closeFloatingPalettes();
}
// Capture runs before the SVG's preventDefault, which otherwise keeps inputs focused.
document.addEventListener('pointerdown',outsideEditorPointer,true);
for(const details of office.querySelectorAll('details'))details.addEventListener('toggle',()=>{if(details.open){finishInline();closeFloatingPalettes(details);refreshFloating();}});
function pageWheel(ev){
  if(!(ev.ctrlKey||ev.metaKey))return;
  ev.preventDefault();ev.stopPropagation();finishInline();endDrag();closeFloatingPalettes();
  const delta=(ev.deltaY||ev.deltaX)*(ev.deltaMode===1?16:ev.deltaMode===2?window.innerHeight:1);
  if(!delta)return;
  pageScale=Math.max(.5,Math.min(2.5,pageScale*Math.exp(-Math.max(-160,Math.min(160,delta))*.002)));
  document.body.style.zoom=String(pageScale);
  const headerHeight=['header','.subbar','.insert-toolbar'].reduce((height,selector)=>height+(document.querySelector(selector)?.offsetHeight||0),0);
  document.querySelector('main').style.height=Math.max(180,pageHeight()-headerHeight-34)+'px';
  render();toast('页面缩放 '+Math.round(pageScale*100)+'%');
}
document.addEventListener('wheel',pageWheel,{capture:true,passive:false});


function refreshElementList(){
 const host=$('#elementList');if(!host)return;
 host.hidden=!!selected&&selected.kind!=='group'&&!state.listPinned;
 if(host.hidden)return;
 host.innerHTML=`<div class="element-list-head"><b>全部元素 · ${state.events.length}</b><button id="pinElementList" aria-pressed="${!!state.listPinned}" title="钉住后编辑节点时仍显示列表">${state.listPinned?'📌 已钉住':'📌 钉住'}</button></div><p class="help">${selected?.kind==='group'?'分组编辑中：点击节点或列表名称加入／移出分组；点击画布空白退出。':'眼睛控制画布显隐；点击名称编辑。分组折叠时需先展开分组。'}</p><div class="element-list-rows">${sortedEvents().map(e=>`<div class="element-list-row ${isSelectedEvent(e.id)?'chosen':''}"><button data-visibility="${esc(e.id)}" aria-label="${e.hidden?'显示':'隐藏'} ${esc(e.title)}" aria-pressed="${!e.hidden}" title="${e.hidden?'当前隐藏，点击显示':'当前显示，点击隐藏'}">${e.hidden?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M9 5c6-1 11 7 11 7a20 20 0 0 1-4 4M6 6a22 22 0 0 0-4 6s8 12 17 5M10 10a3 3 0 0 0 4 4"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s9-14 20 0c-11 14-20 0-20 0Z"/><circle cx="12" cy="12" r="3"/></svg>'}</button><button data-list-select="${esc(e.id)}" class="element-list-name"><span>${esc(e.icon|| (e.type==='period'?'━':'◆'))} ${esc(e.title)}${selected?.kind==='group'&&e.group===selected.id?' ✓':''}</span><small>${esc(e.start)}${e.end?' → '+esc(e.end):''}</small></button></div>`).join('')||'<p class="help">暂无节点</p>'}</div>`;
 $('#pinElementList').onclick=()=>{state.listPinned=!state.listPinned;save();refreshElementList();};
 host.querySelectorAll('[data-visibility]').forEach(button=>button.onclick=()=>{const e=state.events.find(e=>e.id===button.dataset.visibility);snapshot();e.hidden=!e.hidden;render();});
 host.querySelectorAll('[data-list-select]').forEach(button=>button.onclick=()=>{if(selected?.kind==='group')toggleGroupMember(button.dataset.listSelect);else select({kind:'event',id:button.dataset.listSelect});});
}
function copyElements(){
 if(selected?.kind==='all'){elementClipboard=structuredClone({all:true,events:state.events.filter(e=>selected.ids.includes(e.id)),groups:state.groups.filter(g=>selected.groupIds.includes(g.id)),labels:state.floatingLabels.filter(e=>selected.floatingIds.includes(e.id))});toast('已复制全部元素');return true;}
 if(selected?.kind==='floating'){elementClipboard={floating:structuredClone(state.floatingLabels.find(e=>e.id===selected.id))};toast('已复制悬浮标签');return true;}
 const group=selected?.kind==='group'?state.groups.find(g=>g.id===selected.id):null;
 const events=group?state.events.filter(e=>e.group===group.id):state.events.filter(e=>selectedIds(selected).includes(e.id));
 if(!group&&!events.length)return false;
 elementClipboard=structuredClone({group,events});toast('已复制，可用 Ctrl／⌘＋V 粘贴');return true;
}
function pasteElements(){
 if(!elementClipboard)return false;
 snapshot();const payload=structuredClone(elementClipboard);if(payload.all){pasteAllPayload(payload);return true;}if(payload.floating){const e=payload.floating;e.id=crypto.randomUUID();e.x+=20;e.y+=20;state.floatingLabels.push(e);select({kind:'floating',id:e.id});return true;}let groupId='';
 if(payload.group){const g=payload.group;g.id=crypto.randomUUID();g.name+=' 副本';g.locked=false;g.manual=false;state.groups.push(g);groupId=g.id;}
 const ids=[];for(const e of payload.events){e.id=crypto.randomUUID();e.title+=' 副本';e.locked=false;e.manual=false;e.hidden=false;e.group=groupId||(state.groups.some(g=>g.id===e.group)?e.group:'');const g=state.groups.find(g=>g.id===e.group);if(g)g.collapsed=false;state.events.push(e);ids.push(e.id);}
 select(groupId?{kind:'group',id:groupId}:selectionFromIds(ids));toast('已粘贴，日期保持不变');return true;
}
function deleteElements(){
 if(selected?.kind==='all'){snapshot();state.events=state.events.filter(e=>!selected.ids.includes(e.id));state.groups=state.groups.filter(g=>!selected.groupIds.includes(g.id));state.floatingLabels=state.floatingLabels.filter(e=>!selected.floatingIds.includes(e.id));select(null);return true;}
 if(selected?.kind==='floating'){snapshot();state.floatingLabels=state.floatingLabels.filter(e=>e.id!==selected.id);select(null);return true;}
 const groupId=selected?.kind==='group'?selected.id:null;
 const ids=new Set(groupId?state.events.filter(e=>e.group===groupId).map(e=>e.id):selectedIds(selected));
 if(!groupId&&!ids.size)return false;
 snapshot();state.events=state.events.filter(e=>!ids.has(e.id));if(groupId)state.groups=state.groups.filter(g=>g.id!==groupId);select(null);toast('已删除，可按 Ctrl／⌘＋Z 恢复');return true;
}
function elementShortcut(ev){
 const key=ev.key.toLowerCase(),mod=ev.ctrlKey||ev.metaKey;let handled=false;
 if(key==='delete'||key==='backspace')handled=deleteElements();
 else if(mod&&!ev.altKey){
  if(key==='c')handled=copyElements();
  if(key==='v')handled=pasteElements();
  if(key==='x'&&copyElements())handled=deleteElements();
  if(key==='d'&&copyElements())handled=pasteElements();
  if(key==='a'){selectAllElements();handled=true;}
 }
 if(handled)ev.preventDefault();return handled;
}
refreshElementList();

function recordPendingChange(){
 if(!pendingChange)return;const before=JSON.parse(pendingChange);pendingChange=null;
 const compare=s=>JSON.stringify({title:s.title,projectInfo:s.projectInfo,events:s.events,groups:s.groups,floatingLabels:s.floatingLabels,layout:s.layout,textStyles:s.textStyles});
 if(compare(before)===compare(state))return;
 const nodeDelta=state.events.length-before.events.length,labelDelta=state.floatingLabels.length-(before.floatingLabels?.length||0);
 const summary=nodeDelta?`${nodeDelta>0?'新增':'删除'} ${Math.abs(nodeDelta)} 个节点`:labelDelta?`${labelDelta>0?'新增':'删除'} ${Math.abs(labelDelta)} 个悬浮标签`:before.title!==state.title||JSON.stringify(before.projectInfo)!==JSON.stringify(state.projectInfo)?'编辑项目信息':'修改元素／布局／外观';
 const id=crypto.randomUUID();pendingVersionId=id;state.revisions.push({id,snapshotId:id,snapshotStatus:'pending',kind:'auto',time:new Date().toISOString(),version:state.projectInfo.version||'',summary});state.revisions=retainRevisions(state.revisions);
}
function refreshProjectInfo(){
 for(const [id,value]of [['infoTitle',state.title],['infoOwner',state.projectInfo.owner||''],['infoDescription',state.projectInfo.description||''],['infoVersion',state.projectInfo.version||'']]){const input=$('#'+id);if(input&&document.activeElement!==input)input.value=value;}
 const root=$('#revisionList');if(root)root.innerHTML=[...state.revisions].reverse().map(r=>`<article class="revision-entry"><b><span class="revision-kind ${r.kind==='tag'?'tag':''}">${r.kind==='tag'?'TAG':'自动'}</span> ${esc(r.name||r.version||'未命名版本')}</b><time>${esc(new Date(r.time).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}))}</time><p>${esc(r.summary)}</p><button data-open-version="${esc(r.id)}" ${r.snapshotStatus==='ready'?'':'disabled'}>${r.snapshotStatus==='ready'?'↗ 在新窗口恢复':r.snapshotStatus==='pending'?'快照保存中…':r.snapshotStatus==='error'?'快照保存失败':'旧记录 · 无可恢复快照'}</button></article>`).join('')||'<p class="help">暂无修改记录</p>';
 if(root)root.querySelectorAll('[data-open-version]').forEach(button=>button.onclick=()=>openRevision(button.dataset.openVersion));
}
for(const [id,key]of [['infoOwner','owner'],['infoDescription','description'],['infoVersion','version']])$('#'+id).onchange=ev=>{snapshot();state.projectInfo[key]=ev.target.value.trim();save();};
$('#infoTitle').onchange=ev=>{snapshot();state.title=ev.target.value.trim()||'未命名时间轴';save();};
$('#recordVersion').onclick=()=>{state.projectInfo.version=$('#infoVersion').value.trim();const id=crypto.randomUUID();pendingVersionId=id;state.revisions.push({id,snapshotId:id,snapshotStatus:'pending',kind:'tag',name:$('#revisionName').value.trim()||$('#infoVersion').value.trim()||'命名版本',time:new Date().toISOString(),version:$('#infoVersion').value.trim()||state.projectInfo.version||'未命名版本',summary:$('#revisionNote').value.trim()||'手动记录当前版本'});state.revisions=retainRevisions(state.revisions);$('#revisionNote').value='';$('#revisionName').value='';pendingChange=null;save();};
function addFloating(){
 snapshot();const e={id:crypto.randomUUID(),title:'悬浮标签',x:Math.max(15,stage.clientWidth/2-60),y:stage.scrollTop+80,color:'#fff2cc',textColor:'#22332e',textStyles:{},opacity:1,design:'label'};
 state.floatingLabels.push(e);select({kind:'floating',id:e.id});
}
$('#newFloating').onclick=addFloating;
function renderFloatingLabels(){
 for(const e of state.floatingLabels){
 const title=(e.icon?e.icon+' ':'')+e.title,st=textStyle(e,'title',14),width=Math.max(80,textWidth(title,st)+24),height=st.size*1.5+16;
 const el=node('g',{'data-floating':e.id,class:'floating-label',tabindex:0,role:'button','aria-label':'悬浮标签 '+e.title});
 el.append(node('rect',{x:e.x,y:e.y,width,height,rx:e.design==='square'?0:e.design==='round'?height/2:6,fill:e.color,'fill-opacity':e.opacity??1,stroke:(selected?.kind==='floating'&&selected.id===e.id)||(selected?.kind==='all'&&selected.floatingIds.includes(e.id))?'#c7000b':'#aeb4bc','stroke-width':selected?.id===e.id||selected?.kind==='all'&&selected.floatingIds.includes(e.id)?2:1}));
 el.append(node('text',{x:e.x+12,y:e.y+8+st.size,...textAttrs(e,'title',14,1,e.textColor),'pointer-events':'none'},title));svg.append(el);
 }
}
function floatingEditor(){
 const e=state.floatingLabels.find(e=>e.id===selected.id);if(!e)return;
 $('#panelTitle').textContent='悬浮标签';$('#editor').innerHTML=`<p class="help">不绑定日期，不参与自动避让。直接拖动；双击改字，外观使用悬浮工具栏设置。</p><div class="field"><label>标签文字</label><textarea id="floatingTitle">${esc(e.title)}</textarea></div><div class="row"><div class="field"><label>X</label><input type="number" id="floatingX" value="${e.x}"></div><div class="field"><label>Y</label><input type="number" id="floatingY" value="${e.y}"></div></div><button id="deleteFloating" class="danger">删除悬浮标签</button>`;
 $('#floatingTitle').onchange=ev=>{snapshot();e.title=ev.target.value.trim()||'悬浮标签';render();};
 for(const key of ['x','y'])$('#floating'+key.toUpperCase()).onchange=ev=>{const n=Number(ev.target.value);if(Number.isFinite(n)){snapshot();e[key]=Math.max(0,n);render();}};
 $('#deleteFloating').onclick=deleteElements;
}
function startFloatingDrag(ev,target){
 ev.preventDefault();finishInline();const id=target.dataset.floating;select({kind:'floating',id});const e=state.floatingLabels.find(e=>e.id===id);
 drag={mode:'floating',id,x:pointerX(ev),y:pointerY(ev),labelX:e.x,labelY:e.y,originals:[],moved:false,ppd:view.ppd};svg.setPointerCapture(ev.pointerId);
}
function moveFloating(ev){
 ev.preventDefault();const dx=pointerX(ev)-drag.x,dy=pointerY(ev)-drag.y;if(!drag.moved&&Math.hypot(dx,dy)<4)return;
 if(!drag.moved)snapshot();drag.moved=true;const e=state.floatingLabels.find(e=>e.id===drag.id);e.x=Math.max(0,drag.labelX+dx);e.y=Math.max(0,drag.labelY+dy);render();
}
function editFloatingText(id){select({kind:'floating',id});const input=$('#floatingTitle');input.focus();input.select();}


function retainRevisions(records){
 if(!Array.isArray(records))return [];
 const normalized=records.filter(r=>r&&typeof r.time==='string'&&typeof r.summary==='string').map(r=>{
  if(r.kind==='auto'||r.kind==='tag')return r;
  // Older versions omitted record kind. Preserve unrecognised notes as TAGs.
  const automatic=/^(新增|删除) \d+ 个(节点|悬浮标签)$/.test(r.summary)||['编辑项目信息','修改元素／布局／外观'].includes(r.summary);
  return {...r,kind:automatic?'auto':'tag'};
 });
 let kept=0;return normalized.slice().reverse().filter(r=>r.kind==='tag'||++kept<=50).reverse();
}
function toggleGroupMember(id){
 if(selected?.kind!=='group')return false;
 const g=state.groups.find(g=>g.id===selected.id),e=state.events.find(e=>e.id===id);if(!g||!e)return false;
 finishInline();snapshot();const leaving=e.group===g.id;
 e.group=leaving?'':g.id;e.manual=false;e.locked=false;delete e.lockBase;e.localOffset=25;
 if(!leaving){e.side=g.side;g.collapsed=false;}
 editor();render();toast(leaving?'已移出分组':'已加入分组');return true;
}


function selectAllElements(){
 finishInline();endDrag();if(!state.events.length&&!state.groups.length&&!state.floatingLabels.length){select(null);toast('暂无可选元素');return;}select({kind:'all',ids:state.events.map(e=>e.id),groupIds:state.groups.map(g=>g.id),floatingIds:state.floatingLabels.map(e=>e.id)});
}
function allEditor(){
 $('#panelTitle').textContent=selected.scope==='rectangle'?'框选 · 批量编辑':'全选 · 整体编辑';
 $('#editor').innerHTML=`<div class="selection-caption">${selected.ids.length} 个节点 · ${selected.groupIds.length} 个分组 · ${selected.floatingIds.length} 个悬浮标签</div><p class="help">文字属性按钮应用到当前选中元素；顶部整体字号按钮仍作用于全项目。保留字体、颜色和相对字号差异。</p><button id="selectionFormat">Aa 字体、字号与文字属性</button><div class="attachment-tools"><button id="allSmaller">A− 所选缩小</button><button id="allLarger">A＋ 所选放大</button></div><p class="help">每次调整 2px，范围 8–48px。可用 Ctrl／⌘＋Z 撤销。</p>`;
 $('#selectionFormat').onclick=openFormat;$('#allSmaller').onclick=()=>resizeSelectedText(-2);$('#allLarger').onclick=()=>resizeSelectedText(2);
}
function resizeAllText(delta){
 finishInline();const targets=[[state,['projectTitle']],...state.events.map(e=>[e,TEXT_FIELDS]),...state.groups.map(g=>[g,GROUP_FIELDS]),...state.floatingLabels.map(e=>[e,['title']])];
 const changes=[];
 for(const [item,fields]of targets)for(const field of fields){const base=state.floatingLabels.includes(item)?14:defaultSize(field),current=textStyle(item,field,base),size=Math.max(8,Math.min(48,current.size+delta));if(size!==current.size)changes.push({item,field,style:normalizeTextStyle({...current,size})});}
 if(!changes.length){toast('字号已达到范围限制');return;}
 snapshot();for(const {item,field,style}of changes){item.textStyles??={};item.textStyles[field]=style;}
 editor();render();toast(delta>0?'全项目文字已放大 2px':'全项目文字已缩小 2px');
}
function pasteAllPayload(payload){
 const map=new Map(),groupIds=[],ids=[],floatingIds=[];
 for(const g of payload.groups){const old=g.id;g.id=crypto.randomUUID();map.set(old,g.id);g.name+=' 副本';g.locked=false;g.manual=false;state.groups.push(g);groupIds.push(g.id);}
 for(const e of payload.events){e.id=crypto.randomUUID();e.group=map.get(e.group)||'';e.title+=' 副本';e.locked=false;e.manual=false;state.events.push(e);ids.push(e.id);}
 for(const e of payload.labels){e.id=crypto.randomUUID();e.x+=20;e.y+=20;state.floatingLabels.push(e);floatingIds.push(e.id);}
 select({kind:'all',ids,groupIds,floatingIds});toast('已粘贴全部元素，保留分组关系');
}
$('#selectAll').onclick=selectAllElements;
$('#globalFontDown').onclick=()=>resizeAllText(-2);$('#globalFontUp').onclick=()=>resizeAllText(2);

function setProjectPanelCollapsed(collapsed,persist=true){
 finishInline();const panel=$('#projectInfoPanel'),button=$('#projectPanelToggle');
 document.body.classList.toggle('project-panel-collapsed',collapsed);$('#projectInfoContent').hidden=collapsed;
 button.textContent=collapsed?'›':'‹';button.setAttribute('aria-expanded',String(!collapsed));button.title=collapsed?'展开项目信息栏':'收起项目信息栏';button.setAttribute('aria-label',button.title);
 if(persist)try{localStorage.setItem('osa-project-panel-collapsed',String(collapsed));}catch{}
 render();
}
$('#projectPanelToggle').onclick=()=>setProjectPanelCollapsed(!$('#projectInfoContent').hidden);
setProjectPanelCollapsed(localStorage.getItem('osa-project-panel-collapsed')==='true',false);
function setCanvasTool(tool){canvasTool=tool;$('#panTool').setAttribute('aria-pressed',tool==='pan');$('#marqueeTool').setAttribute('aria-pressed',tool==='select');svg.classList.toggle('selection-tool',tool==='select');}
$('#panTool').onclick=()=>setCanvasTool('pan');$('#marqueeTool').onclick=()=>setCanvasTool('select');
function startMarquee(ev){
 ev.preventDefault();finishInline();const rect=cssRect(svg),add=ev.ctrlKey||ev.metaKey;
 const seedIds=add?selectedIds(selected):[],seedGroups=add&&selected?.kind==='all'?selected.groupIds:[],seedFloating=add&&selected?.kind==='all'?selected.floatingIds:[];
 if(!add)select(null);
 drag={mode:'marquee',decorations:true,x:pointerX(ev),y:pointerY(ev),origin:{x:pointerX(ev)-rect.left,y:pointerY(ev)-rect.top},seedIds,seedGroups,seedFloating,moved:false,originals:[],ppd:view.ppd};svg.setPointerCapture(ev.pointerId);
}
function rectangleSelection(rect,seedIds=[],seedGroups=[],seedFloating=[]){
 const ids=[...new Set([...seedIds,...hitsInRectangle(rect,computed.positions,view.axis)])],groups=[...seedGroups],floating=[...seedFloating];
 for(const g of state.groups){const b=computed.boxes.get(g.id);if(!b)continue;const top=b.side<0?view.axis-b.bottom:view.axis+b.top,bottom=top+b.bottom-b.top;if(rect.left<=b.left&&rect.right>=b.right&&rect.top<=top&&rect.bottom>=bottom)groups.push(g.id);}
 for(const e of state.floatingLabels){const st=textStyle(e,'title',14),w=Math.max(80,textWidth((e.icon?e.icon+' ':'')+e.title,st)+24),h=st.size*1.5+16;if(e.x<=rect.right&&e.x+w>=rect.left&&e.y<=rect.bottom&&e.y+h>=rect.top)floating.push(e.id);}
 return groups.length||floating.length?{kind:'all',scope:'rectangle',ids,groupIds:[...new Set(groups)],floatingIds:[...new Set(floating)]}:selectionFromIds(ids);
}
function resizeSelectedText(delta){
 const targets=selected?.kind==='all'?[...state.events.filter(e=>selected.ids.includes(e.id)).map(e=>[e,TEXT_FIELDS]),...state.groups.filter(e=>selected.groupIds.includes(e.id)).map(e=>[e,GROUP_FIELDS]),...state.floatingLabels.filter(e=>selected.floatingIds.includes(e.id)).map(e=>[e,['title']])]:state.events.filter(e=>selectedIds(selected).includes(e.id)).map(e=>[e,TEXT_FIELDS]);
 if(!targets.length)return;snapshot();for(const [item,fields]of targets){item.textStyles??={};for(const field of fields){const base=state.floatingLabels.includes(item)?14:defaultSize(field),style=textStyle(item,field,base);item.textStyles[field]=normalizeTextStyle({...style,size:Math.max(8,Math.min(48,style.size+delta))});}}
 editor();render();
}
function flushVersionCapture(){
 if(drag?.moved||restoreLoading)return;
 const fingerprint=JSON.stringify({...state,revisions:undefined});
 let id=pendingVersionId;
 if(!id&&lastCaptureId&&state.revisions.at(-1)?.id===lastCaptureId&&fingerprint!==lastCaptureFingerprint)id=lastCaptureId;
 if(!id)return;
 pendingVersionId=null;const payload=snapshotDocument(state),captured=payload.revisions.find(r=>r.id===id);if(!captured)return;
 lastCaptureId=captured.kind==='auto'?id:null;lastCaptureFingerprint=fingerprint;captured.snapshotStatus='ready';
 versionWrites=versionWrites.then(()=>writeVersionSnapshot(id,payload)).then(()=>{failedSnapshotWrites.delete(id);const r=state.revisions.find(r=>r.id===id);if(r){r.snapshotStatus='ready';save();}}).catch(()=>{failedSnapshotWrites.set(id,payload);const r=state.revisions.find(r=>r.id===id);if(r)r.snapshotStatus='error';save();toast('历史快照保存失败，请导出当前项目备份');});
}
function openRevision(id){
 const r=state.revisions.find(r=>r.id===id);if(!r||r.snapshotStatus!=='ready')return;
 const url=new URL(window.location.href);url.search='';url.hash='';url.searchParams.set('restore',r.snapshotId);url.searchParams.set('draft',crypto.randomUUID());
 window.open(url.href,'_blank','noopener');
}
async function initializeRestore(){
 if(!restoreId)return;
 $('#restoreLoading').hidden=false;$('#restoreBanner').hidden=false;document.body.classList.add('history-window');
 try{
  const payload=initialDraft||await readVersionSnapshot(restoreId);if(!valid(payload))throw Error('未找到可用的历史快照。请在原窗口重新选择，或导入包含快照的 JSON。');
  state=normalize(structuredClone(payload));restoreLoading=false;lastCaptureId=null;pendingChange=null;undo=[];redo=[];$('#restoreLoading').hidden=true;select(null);fit();
  const revision=state.revisions.find(r=>r.snapshotId===restoreId);$('#restoreDescription').textContent=(revision?.name||revision?.version||'历史版本')+' · 独立草稿，编辑不会自动覆盖最新版本';
 }catch(error){$('#restoreLoading').textContent=error.message||'历史版本读取失败';$('#saveRestored').disabled=true;}
}
async function saveRestoredVersion(){
 if(!restoreId||restoreLoading)return;
 finishInline();endDrag();await versionWrites;
 const latestText=localStorage.getItem('osa-timeline-v1');let latest;
 try{const parsed=JSON.parse(latestText);if(valid(parsed))latest=normalize(parsed);}catch{}
 if(!valid(latest)){toast('最新项目无法读取，请先导出当前历史副本');return;}
 if(!window.confirm('是否用此历史副本覆盖当前最新项目？\n覆盖前会保留最新项目的 TAG 备份。取消不会修改最新项目。'))return;
 const button=$('#saveRestored');button.disabled=true;
 try{
  const backupId=crypto.randomUUID(),restoredId=crypto.randomUUID(),time=new Date().toISOString();
  const backup={id:backupId,kind:'tag',snapshotId:backupId,snapshotStatus:'ready',time,version:latest.projectInfo?.version||'',summary:'覆盖前备份 · 最新项目'};
  const merged=new Map([...latest.revisions,...state.revisions].map(r=>[r.id,r]));merged.set(backupId,backup);
  const restored={id:restoredId,kind:'tag',snapshotId:restoredId,snapshotStatus:'ready',time,version:state.projectInfo.version||'',summary:'从历史副本保存为最新项目'};merged.set(restoredId,restored);
  const candidate=structuredClone(state);candidate.revisions=retainRevisions([...merged.values()]);
  await writeVersionSnapshot(backupId,{...latest,revisions:[...latest.revisions,backup]});await writeVersionSnapshot(restoredId,candidate);
  if(localStorage.getItem('osa-timeline-v1')!==latestText){toast('最新项目刚刚发生变化，请再次保存并确认覆盖');return;}
  localStorage.setItem('osa-timeline-v1',JSON.stringify(candidate));state=candidate;save();toast('已保存为最新项目，覆盖前备份已保留');
 }catch{toast('保存失败，未完成覆盖；请导出历史副本备份');}finally{button.disabled=false;}
}
$('#saveRestored').onclick=saveRestoredVersion;
window.addEventListener('storage',ev=>{
 if(restoreId||ev.key!=='osa-timeline-v1'||!ev.newValue)return;if(saveFailed){toast('其他窗口已更新，当前未保存内容仍保留，请先导出备份');return;}
 try{const incoming=JSON.parse(ev.newValue);if(!valid(incoming))return;pendingChange=null;pendingVersionId=null;lastCaptureId=null;drag=null;localFileHandle=null;localFileText='';localFileName='';localSavedAt='';state=normalize(incoming);undo=[];redo=[];select(null);toast('已同步另一个窗口保存的最新项目');}catch{}
});
const restoreInitialization=initializeRestore();

async function verifyStoredVersions(){
 await restoreInitialization;await versionWrites;if(restoreLoading)return;
 let changed=false;
 for(const r of state.revisions){if(!r.snapshotId)continue;try{const payload=await readVersionSnapshot(r.snapshotId);const status=payload?'ready':'error';if(r.snapshotStatus!==status){r.snapshotStatus=status;changed=true;}}catch{if(r.snapshotStatus!=='error'){r.snapshotStatus='error';changed=true;}}}
 if(changed)save();
}
verifyStoredVersions();

async function thumbnail(src){const img=new Image();img.src=src;await img.decode();const c=document.createElement('canvas'),ratio=Math.min(1,240/Math.max(img.width,img.height));c.width=Math.max(1,Math.round(img.width*ratio));c.height=Math.max(1,Math.round(img.height*ratio));c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/webp',.7);}
function showImage(id){const e=state.events.find(e=>e.id===id);if(!e?.image)return;$('#fullImage').src=e.image;$('#fullImage').alt=e.title+' · 附件';$('#imageViewer').showModal();}
$('#closeImageViewer').onclick=()=>{$('#imageViewer').close();$('#fullImage').src='';};
function imageInventory(){const images=state.events.filter(e=>e.image);$('#imageInventory').innerHTML=`<p>${images.length} 张图片 · 约 ${(images.reduce((n,e)=>n+e.image.length+(e.imageThumb?.length||0),0)*.75/1024/1024).toFixed(2)} MB</p>`+images.map(e=>`<article class="image-card"><button data-view-image="${esc(e.id)}" title="点击放大"><img loading="lazy" decoding="async" src="${e.imageThumb||e.image}" alt="${esc(e.title)}"></button><div><b>${esc(e.title)}</b><p>${esc(e.start)}</p><button data-replace-image="${esc(e.id)}">替换</button><button data-delete-image="${esc(e.id)}">删除</button></div></article>`).join('');$('#imageInventory').querySelectorAll('[data-view-image]').forEach(b=>b.onclick=()=>showImage(b.dataset.viewImage));$('#imageInventory').querySelectorAll('[data-replace-image]').forEach(b=>b.onclick=()=>{$('#imageManager').close();select({kind:'event',id:b.dataset.replaceImage});openContent('image');});$('#imageInventory').querySelectorAll('[data-delete-image]').forEach(b=>b.onclick=()=>{snapshot();const e=state.events.find(e=>e.id===b.dataset.deleteImage);e.image='';e.imageThumb='';render();editor();imageInventory();});}
$('#imageManagerBtn').onclick=()=>{imageInventory();$('#imageManager').showModal();};$('#closeImages').onclick=()=>$('#imageManager').close();
function reportOptions(){return {start:$('#reportStart').value,end:$('#reportEnd').value,notes:$('#reportNotes').checked,hidden:$('#reportHidden').checked,groups:[...$('#reportGroups').querySelectorAll('input')].filter(e=>e.checked).map(e=>e.value)};}
function reportCount(){const data=reportData(state,reportOptions());$('#reportCount').textContent=`当前包含 ${data.events.length} 个节点`;}
$('#reportBtn').onclick=()=>{$('#reportGroups').innerHTML=[...state.groups,{id:'',name:'未分组'}].map(g=>`<label><input type="checkbox" value="${esc(g.id)}" checked> ${esc(g.name)}</label>`).join('');$('#reportGroups').querySelectorAll('input').forEach(e=>e.onchange=reportCount);reportCount();$('#reportDialog').showModal();};$('#closeReport').onclick=()=>$('#reportDialog').close();for(const id of ['reportStart','reportEnd','reportNotes','reportHidden'])$('#'+id).onchange=reportCount;
async function rasterReport(markup){const url=URL.createObjectURL(new Blob([markup],{type:'image/svg+xml;charset=utf-8'}));try{const image=new Image();image.src=url;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;c.getContext('2d').drawImage(image,0,0);return c;}finally{URL.revokeObjectURL(url);}}
$('#reportDialog').querySelectorAll('[data-report]').forEach(button=>button.onclick=async()=>{const buttons=$('#reportDialog').querySelectorAll('[data-report]');buttons.forEach(b=>b.disabled=true);try{const options=reportOptions();if(options.start&&!calendarDate(options.start)||options.end&&!calendarDate(options.end)||options.start&&options.end&&options.start>options.end)throw Error('请检查时间范围');const data=reportData(state,options);if(!data.events.length)throw Error('所选范围没有可导出的节点');const type=button.dataset.report;if(type==='png'){const pages=[];for(let i=0;i<reportRows(data).length;i+=12)pages.push(reportSvg(data,i,12,true));$('#reportDialog').close();openImageExport(pages);return;}if(type==='xlsx')downloadBlob(excelReport(data),'OSA-交付汇报.xlsx');else{const pages=[],limit=type==='pdf'?(data.notes?6:10):12,total=reportRows(data).length;for(let i=0;i<total;i+=limit){$('#reportCount').textContent=`正在生成第 ${i/limit+1} 页…`;const canvas=await rasterReport(reportSvg(data,i,limit));if(type==='png'){const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('图片生成失败');downloadBlob(blob,`OSA-交付汇报-${i/limit+1}.png`);}else{const raw=atob(canvas.toDataURL('image/jpeg',.94).split(',')[1]);pages.push({width:canvas.width,height:canvas.height,bytes:Uint8Array.from(raw,c=>c.charCodeAt(0))});}}if(type==='pdf')downloadBlob(pdfReport(pages),'OSA-交付汇报.pdf');}$('#reportCount').textContent='导出完成。多页 PNG 请允许浏览器下载多个文件。';}catch(error){$('#reportCount').textContent='导出失败：'+error.message;}finally{buttons.forEach(b=>b.disabled=false);}});

function localDirty(){return projectFingerprint(state)!==localFileBaseline;}
function refreshLocalFileStatus(){const el=$('#localFileStatus');if(!el)return;el.textContent=(localFileName||'浏览器草稿 · 未关联本地文件')+(localDirty()?' · 有未保存到文件的修改':'')+(localSavedAt?' · 最近文件保存 '+new Date(localSavedAt).toLocaleString('zh-CN',{hour12:false}):'');for(const id of ['newLocalProject','openLocalProject','saveLocalProject','saveAsLocalProject','downloadLocalProject','chooseLocalProject'])$('#'+id).disabled=localBusy;$('#reloadLocalProject').disabled=!localFileHandle||localBusy;$('#localProjectBtn').textContent=localDirty()?'本地项目 ●':'本地项目';}
function allowProjectSwitch(){if(localBusy)return false;return !localDirty()||window.confirm('当前修改尚未保存到本地文件。继续切换？当前内容会保留为可恢复备份；取消可先保存。');}
$('#localProjectBtn').onclick=()=>{refreshLocalFileStatus();$('#localProjectDialog').showModal();};$('#closeLocalProject').onclick=()=>$('#localProjectDialog').close();
$('#newLocalProject').onclick=()=>{if(!allowProjectSwitch())return;$('#localProjectDialog').close();$('#newProjectName').value='未命名项目';$('#newProjectDialog').showModal();};$('#cancelNewProject').onclick=()=>$('#newProjectDialog').close();
$('#confirmNewProject').onclick=async()=>{if(localBusy)return;const button=$('#confirmNewProject');button.disabled=true;try{await versionWrites;const baseline=JSON.stringify(state),id=crypto.randomUUID(),backup={id,snapshotId:id,snapshotStatus:'ready',kind:'tag',name:'新建项目前备份',time:new Date().toISOString(),summary:'新建空白项目之前的完整项目'};await writeVersionSnapshot(id,snapshotDocument(state));if(JSON.stringify(state)!==baseline)throw Error('项目已变化，请重试');state=normalize(blankProject($('#newProjectName').value));state.revisions=[backup];undo=[];redo=[];pendingChange=null;pendingVersionId=null;lastCaptureId=null;localFileHandle=null;localFileText='';localFileName='';localFileBaseline='';localSavedAt='';$('#newProjectDialog').close();select(null);fit();toast('已新建空白项目，请保存到本地文件');}catch(error){toast('未新建项目：'+error.message);}finally{button.disabled=false;}};
async function previewLocalProject(file,handle=null){if(file.size>80*1024*1024)throw Error('项目文件超过 80 MB');const text=await file.text();incomingImport=JSON.parse(text);pendingLocalOpen={handle,text,name:file.name};importBaseline=JSON.stringify(state);$('#importMode').value='replace';$('#importMode').disabled=true;previewImport();$('#localProjectDialog').close();$('#importDialog').showModal();}
$('#openLocalProject').onclick=async()=>{if(!allowProjectSwitch())return;try{if(!window.showOpenFilePicker){$('#localProjectFile').click();return;}const [handle]=await window.showOpenFilePicker({multiple:false,types:[{description:'OSA 项目',accept:{'application/json':['.json']}}]});await previewLocalProject(await handle.getFile(),handle);}catch(error){if(error.name!=='AbortError')$('#localFileMessage').textContent='打开失败：'+error.message+'；可使用下方文件选择加载。';}};
$('#chooseLocalProject').onclick=()=>{if(allowProjectSwitch())$('#localProjectFile').click();};
$('#localProjectFile').onchange=async ev=>{const file=ev.target.files[0];if(!file)return;try{await previewLocalProject(file);}catch(error){$('#localFileMessage').textContent='加载失败：'+error.message;}ev.target.value='';};
$('#reloadLocalProject').onclick=async()=>{if(!localFileHandle||!allowProjectSwitch())return;try{await previewLocalProject(await localFileHandle.getFile(),localFileHandle);}catch(error){$('#localFileMessage').textContent='重新加载失败：'+error.message;}};
async function saveLocalProject(asNew=false,downloadOnly=false){if(localBusy)return;finishInline();endDrag();localBusy=true;refreshLocalFileStatus();try{let handle=asNew?null:localFileHandle;const suggested=(state.title||'osa-project').replace(/[\/:*?"<>|]/g,'-')+'.json';if(!downloadOnly&&(!handle||asNew)&&window.showSaveFilePicker)handle=await window.showSaveFilePicker({suggestedName:suggested,types:[{description:'OSA 项目',accept:{'application/json':['.json']}}]});const bundle=await projectBundle(),baseline=projectFingerprint(bundle),text=JSON.stringify(bundle,null,2);if(downloadOnly||!handle){downloadBlob(new Blob([text],{type:'application/json'}),suggested);$('#localFileMessage').textContent='已发起项目下载，请在下载目录确认文件；浏览器未与下载文件建立关联。';toast('已发起本地项目下载');return;}if(handle===localFileHandle&&localFileText&&(await (await handle.getFile()).text())!==localFileText&&!window.confirm('磁盘文件已在其他位置修改，是否用当前项目覆盖？取消后可重新加载或另存为。'))return;await writeProjectFile(handle,text);localFileHandle=handle;localFileText=text;localFileName=handle.name;localFileBaseline=baseline;localSavedAt=new Date().toISOString();$('#localFileMessage').textContent='本地文件保存成功'+(localDirty()?'；保存过程中新增的修改尚未写入。':'。');toast('本地项目已保存');}catch(error){if(error.name!=='AbortError'){$('#localFileMessage').textContent='保存失败：'+error.message+'。当前项目仍保留，请下载项目副本。';toast('本地文件保存失败，请下载项目副本');if(!document.querySelector('dialog[open]'))$('#localProjectDialog').showModal();}}finally{localBusy=false;refreshLocalFileStatus();}}
$('#saveLocalProject').onclick=()=>saveLocalProject();$('#saveAsLocalProject').onclick=()=>saveLocalProject(true);$('#downloadLocalProject').onclick=()=>saveLocalProject(false,true);
document.addEventListener('keydown',ev=>{if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='s'){ev.preventDefault();saveLocalProject(ev.shiftKey);}});
window.addEventListener('beforeunload',ev=>{if(localDirty()){ev.preventDefault();ev.returnValue='';}});
let imageExportPages=[],imageExportSource=null,imagePreviewURL='',imageCropDrag=null;
function svgExportSource(markup){const parsed=new DOMParser().parseFromString(markup,'image/svg+xml'),root=parsed.documentElement;const box=(root.getAttribute('viewBox')||'').split(/[ ,]+/).map(Number);const width=Number(root.getAttribute('width'))||box[2],height=Number(root.getAttribute('height'))||box[3];if(!width||!height)throw Error('无法读取图像尺寸');return {markup,width,height};}
function canvasExportMarkup(){finishInline();endDrag();const previous=selected;selected=null;render();let clone;try{clone=svg.cloneNode(true);}finally{selected=previous;render();}clone.removeAttribute('style');clone.setAttribute('xmlns',NS);const b=clone.getAttribute('viewBox').split(/\s+/).map(Number);clone.setAttribute('width',b[2]);clone.setAttribute('height',b[3]);clone.setAttribute('font-family','Arial,Microsoft YaHei,sans-serif');clone.querySelectorAll('.event').forEach(el=>{const image=el.querySelector('image'),event=state.events.find(e=>e.id===el.dataset.id);if(image&&event?.image)image.setAttribute('href',event.image);});clone.querySelectorAll('[data-toggle-group]').forEach(el=>el.remove());clone.querySelectorAll('[tabindex]').forEach(el=>el.removeAttribute('tabindex'));return new XMLSerializer().serializeToString(clone);}
function openImageExport(pages,source='report'){$('#imageExportContext').textContent=source==='canvas'?'当前画布：按当前时间缩放导出，包含图片与悬浮标签。若需完整时间范围，可先使用“适应画布”。':'汇报图片：沿用时间范围、分组与备注筛选，选择要导出的页码。';imageExportPages=pages;$('#imageExportPage').innerHTML=pages.map((_,i)=>`<option value="${i}">第 ${i+1} 页 / 共 ${pages.length} 页</option>`).join('');$('#imageExportPage').value='0';$('#imageExportScale').value='1';$('#imageExportDialog').showModal();loadImageExportPage();}
$('#imageExportBtn').onclick=()=>{try{openImageExport([canvasExportMarkup()],'canvas');}catch(error){toast('无法准备导出：'+error.message);}};
function loadImageExportPage(){imageExportSource=svgExportSource(imageExportPages[Number($('#imageExportPage').value)]);if(imagePreviewURL)URL.revokeObjectURL(imagePreviewURL);imagePreviewURL=URL.createObjectURL(new Blob([imageExportSource.markup],{type:'image/svg+xml'}));$('#imageExportPreview').src=imagePreviewURL;setImageCrop({x:0,y:0,width:imageExportSource.width,height:imageExportSource.height});updateImageExport();}
function setImageCrop(c){for(const [id,key]of [['cropX','x'],['cropY','y'],['cropWidth','width'],['cropHeight','height']])$('#'+id).value=c[key];}
function imageCrop(){return cropBounds({x:$('#cropX').value,y:$('#cropY').value,width:$('#cropWidth').value,height:$('#cropHeight').value},imageExportSource.width,imageExportSource.height);}
function updateImageExport(){try{const crop=imageCrop(),scale=$('#imageExportScale').value;if(scale!=='custom')$('#imageExportWidth').value=Math.round(crop.width*Number(scale));$('#imageExportWidth').readOnly=scale!=='custom';const size=outputPixels(crop,$('#imageExportWidth').value);const overlay=$('#imageCropOverlay');overlay.style.left=crop.x/imageExportSource.width*100+'%';overlay.style.top=crop.y/imageExportSource.height*100+'%';overlay.style.width=crop.width/imageExportSource.width*100+'%';overlay.style.height=crop.height/imageExportSource.height*100+'%';$('#imagePreviewWrap').classList.toggle('transparent-preview',$('#imageExportTransparent').checked);$('#imageExportStatus').textContent=`输出 ${size.width} × ${size.height} px · ${$('#imageExportTransparent').checked?'透明':'白色'}背景`;$('#downloadImageExport').disabled=false;}catch(error){$('#imageExportStatus').textContent=error.message;$('#downloadImageExport').disabled=true;}}
for(const id of ['cropX','cropY','cropWidth','cropHeight','imageExportWidth','imageExportScale','imageExportTransparent'])$('#'+id).oninput=updateImageExport;
$('#imageExportPage').onchange=loadImageExportPage;$('#resetImageCrop').onclick=()=>{setImageCrop({x:0,y:0,width:imageExportSource.width,height:imageExportSource.height});updateImageExport();};
function imageCropPoint(ev){const r=$('#imageExportPreview').getBoundingClientRect();return {x:(ev.clientX-r.left)/r.width*imageExportSource.width,y:(ev.clientY-r.top)/r.height*imageExportSource.height};}
$('#imagePreviewWrap').addEventListener('pointerdown',ev=>{if(ev.button!==0)return;ev.preventDefault();imageCropDrag=imageCropPoint(ev);$('#imagePreviewWrap').setPointerCapture(ev.pointerId);});
$('#imagePreviewWrap').addEventListener('pointermove',ev=>{if(!imageCropDrag)return;setImageCrop(dragCrop(imageCropDrag,imageCropPoint(ev),imageExportSource.width,imageExportSource.height));updateImageExport();});
for(const event of ['pointerup','pointercancel'])$('#imagePreviewWrap').addEventListener(event,()=>{imageCropDrag=null;});
function closeImageExport(){if(imagePreviewURL)URL.revokeObjectURL(imagePreviewURL);imagePreviewURL='';$('#imageExportPreview').src='';imageCropDrag=null;}
$('#closeImageExport').onclick=()=>$('#imageExportDialog').close();$('#imageExportDialog').addEventListener('close',closeImageExport);
$('#downloadImageExport').onclick=async()=>{const button=$('#downloadImageExport');button.disabled=true;try{const source=imageExportSource,crop=imageCrop(),size=outputPixels(crop,$('#imageExportWidth').value),transparent=$('#imageExportTransparent').checked;const url=URL.createObjectURL(new Blob([croppedSvg(source.markup,crop,size)],{type:'image/svg+xml'}));try{const img=new Image();img.src=url;await img.decode();const canvas=document.createElement('canvas');paintExport(canvas,img,size,transparent);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('图片生成失败，请降低分辨率');downloadBlob(blob,`OSA-图片-${size.width}x${size.height}.png`);$('#imageExportStatus').textContent='已导出 PNG 图片';}finally{URL.revokeObjectURL(url);}}catch(error){$('#imageExportStatus').textContent='导出失败：'+error.message;}finally{button.disabled=false;}};
