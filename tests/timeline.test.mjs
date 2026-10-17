import test from 'node:test';
import assert from 'node:assert/strict';
import {layout,measure,intersects} from '../dist/layout.mjs';
import {safeLink,safeImage,resolveSelection} from '../dist/content.mjs';
const x=d=>(Date.parse(d)-Date.parse('2026-01-01'))/86400000*8;
const base={title:'测试节点',start:'2026-11-10',end:'',type:'milestone',side:1,offset:60,scale:1,group:'',manual:false,showDate:false};
test('group click selects only group; child label selects only child',()=>{
  const group={dataset:{group:'g1'}},event={dataset:{id:'e1'}};
  assert.deepEqual(resolveSelection({closest:s=>s==='.group-element'?group:null}),{kind:'group',id:'g1'});
  assert.deepEqual(resolveSelection({closest:s=>s==='.event'?event:group}),{kind:'event',id:'e1'});
  assert.equal(resolveSelection({closest:()=>null}),null);
});
test('legacy vertical offsets no longer create empty rows',()=>{
  const events=Array.from({length:6},(_,i)=>({...base,id:'e'+i,start:`2026-0${i+1}-10`,offset:100+i*500}));
  const l=layout(events,[],x,8);const positions=[...l.positions.values()];
  assert.equal(new Set(positions.map(e=>e.offset)).size,1);assert.ok(l.below<100);
});
test('dense events avoid overlap with compact row spacing',()=>{
  const events=Array.from({length:20},(_,i)=>({...base,id:'e'+i,offset:100+i*200}));
  const l=layout(events,[],x,8),positions=[...l.positions.values()].sort((a,b)=>a.offset-b.offset);
  for(let i=1;i<positions.length;i++){const distance=positions[i].offset-positions[i-1].offset;assert.ok(distance>=positions[i].height+6);assert.ok(distance<50);}
  assert.ok(l.below<1000);
});
test('selection cannot reorder or shift any element',()=>{
  const events=[{...base,id:'a'},{...base,id:'b'}],groups=[];
  assert.deepEqual(layout(events,groups,x,8,'a'),layout(events,groups,x,8,'b'));
});
test('group bounds reserve heading space and avoid other groups',()=>{
  const groups=[{id:'g1',name:'一组',side:-1},{id:'g2',name:'二组',side:-1}];
  const events=[{...base,id:'a',group:'g1'},{...base,id:'b',group:'g1'},{...base,id:'c',group:'g2',image:'data:image/png;base64,AA=='}];
  const l=layout(events,groups,x,8),boxes=[...l.boxes.values()];assert.equal(intersects(boxes[0],boxes[1],6),false);
  for(const e of events){const p=l.positions.get(e.id),b=l.boxes.get(e.group);assert.ok(b.bottom-(p.offset+p.height/2)>=22);assert.equal(p.side,-1);}
});
test('manual adjustments persist, compact mode releases the reserved height',()=>{
  const events=[{...base,id:'a',manual:true,offset:450},{...base,id:'b'}];
  let l=layout(events,[],x,8);assert.equal(l.positions.get('a').offset,450);assert.ok(l.positions.get('b').offset<100);
  events[0].manual=false;l=layout(events,[],x,8);assert.ok(l.below<150);
});
test('periods include full start-end span, images reserve their rendered height',()=>{
  const e={...base,type:'period',end:'2026-12-10',image:'data:image/png;base64,AA=='};
  const p=measure(e,x);assert.equal(p.end-p.x,240);assert.ok(p.height>=p.labelHeight+104);assert.ok(p.width>=240);
  const l=layout([{...e,id:'a'},{...base,id:'b'}],[],x,8);const a=l.positions.get('a'),b=l.positions.get('b');
  assert.ok(Math.abs(a.offset-b.offset)>=(a.height+b.height)/2+6);
});
test('empty groups have independent selectable geometry',()=>{
  const l=layout([], [{id:'g1',name:'新分组',side:1}],x,8);assert.equal(l.boxes.size,1);assert.equal(l.positions.size,0);assert.ok(l.boxes.get('g1').right>l.boxes.get('g1').left);
});
test('links reject executable protocols; image imports reject active markup',()=>{
  assert.equal(safeLink('javascript:alert(1)'), '');assert.equal(safeLink('data:text/html,hi'),'');assert.equal(safeLink('https://example.com/a'),'https://example.com/a');
  assert.equal(safeImage('data:image/svg+xml;base64,AA=='),'');assert.equal(safeImage('data:image/png;base64,AA=='),'data:image/png;base64,AA==');
});

import {pushHistory,HISTORY_LIMIT,wheelIntent,panView,zoomView,historyShortcut} from '../dist/interactions.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
test('undo and redo histories never exceed 50 states; edits clear redo',()=>{
  const undo=[],redo=[];let state=0;
  for(let i=1;i<=75;i++){pushHistory(undo,state);redo.length=0;state=i;}
  assert.equal(HISTORY_LIMIT,50);assert.equal(undo.length,50);assert.equal(undo[0],25);
  for(let i=0;i<50;i++){pushHistory(redo,state);state=undo.pop();}
  assert.equal(state,25);assert.equal(undo.length,0);assert.equal(redo.length,50);
  for(let i=0;i<50;i++){pushHistory(undo,state);state=redo.pop();}
  assert.equal(state,75);assert.equal(undo.length,50);
  pushHistory(undo,state);redo.length=0;state=100;assert.equal(undo.length,50);assert.equal(redo.length,0);
});
test('Ctrl Z/Y, Cmd Z, and Ctrl/Cmd Shift Z map to correct history operations',()=>{
  assert.equal(historyShortcut({key:'z',ctrlKey:true}),'undo');assert.equal(historyShortcut({key:'Y',ctrlKey:true}),'redo');
  assert.equal(historyShortcut({key:'z',metaKey:true}),'undo');assert.equal(historyShortcut({key:'Z',metaKey:true,shiftKey:true}),'redo');
  assert.equal(historyShortcut({key:'z'}),null);assert.equal(historyShortcut({key:'z',ctrlKey:true,altKey:true}),null);
});
test('pan works in all directions with no accumulated delta error',()=>{
  const origin={start:100,ppd:5,panY:12};assert.deepEqual(panView(origin,50,30),{start:90,panY:42});
  assert.deepEqual(panView(origin,-50,-30),{start:110,panY:-18});assert.deepEqual(panView(origin,0,0),{start:100,panY:12});
});
test('timeline zoom preserves date under mouse at all scales',()=>{
  for(const ppd of [.6,1,7,30,55])for(const anchor of [0,180,900])for(const factor of [.2,1.1,5]){
    const view={start:120,ppd},out=zoomView(view,factor,anchor);
    assert.ok(Math.abs((out.start+anchor/out.ppd)-(view.start+anchor/ppd))<1e-8);assert.ok(out.ppd>=.6&&out.ppd<=55);
  }
});
test('Ctrl wheel takes priority over timeline zoom and Shift scrolling',()=>{
  assert.equal(wheelIntent({ctrlKey:true,shiftKey:true}),'page');assert.equal(wheelIntent({metaKey:true}),'page');
  assert.equal(wheelIntent({}),'timeline');assert.equal(wheelIntent({shiftKey:true}),'scroll');
});
const appSource=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
test('canvas wheel delegates modified wheel to document page handler',()=>{
  const begin=appSource.indexOf("svg.addEventListener('wheel'"),end=appSource.indexOf("svg.addEventListener('dblclick'",begin);
  let handler,prevented=0,zooms=0;
  vm.runInNewContext(appSource.slice(begin,end),{pointerX:ev=>ev.clientX,cssRect:el=>el.getBoundingClientRect(),svg:{addEventListener:(type,fn)=>handler=fn,getBoundingClientRect:()=>({left:25})},wheelIntent,drag:null,hideContextMenu:()=>{},stage:{scrollTop:0,clientHeight:600},zoom:()=>zooms++});
  handler({ctrlKey:true,deltaY:100,preventDefault:()=>prevented++});assert.equal(prevented,0);assert.equal(zooms,0);
  handler({deltaY:100,clientX:200,deltaMode:0,preventDefault:()=>prevented++});assert.equal(prevented,1);assert.equal(zooms,1);
});
test('actual blank-space pointer move updates both horizontal and vertical view',()=>{
  const begin=appSource.indexOf("svg.addEventListener('pointermove'"),end=appSource.indexOf('function endDrag()',begin);
  let handler,renders=0;const view={start:10,panY:0,ppd:5},drag={mode:'pan',x:20,y:30,start:10,panY:0,ppd:5,originals:[],moved:false};
  vm.runInNewContext(appSource.slice(begin,end),{pointerX:ev=>ev.clientX,pointerY:ev=>ev.clientY,svg:{addEventListener:(type,fn)=>handler=fn},drag,view,panView,render:()=>renders++,snapshot:()=>assert.fail('panning must not consume edit history'),Math,Object});
  handler({clientX:70,clientY:60,preventDefault:()=>{}});assert.equal(view.start,0);assert.equal(view.panY,30);assert.equal(renders,1);
});
test('right-click actions include every supported insertable element',()=>{
  const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  for(const type of ['milestone','period','group','image','link','note'])assert.ok(html.includes(`data-insert="${type}"`));
  assert.ok(appSource.includes("svg.addEventListener('contextmenu'"));assert.ok(appSource.includes('placement.day,kind,placement.group,placement'));
});

import {dateCaption,displayTitle,migrateDateTitle,shiftEventDates,groupDateRange,syncEventDateFields} from '../dist/dates.mjs';
test('milestones and periods display current dates and can hide them',()=>{
  const milestone={...base,title:'客户送测',showDate:true};assert.equal(dateCaption(milestone),'2026-11-10');assert.equal(displayTitle(milestone),'2026-11-10 · 客户送测');
  const period={...milestone,type:'period',end:'2026-12-05'};assert.equal(dateCaption(period),'2026-11-10 → 2026-12-05');
  period.showDate=false;assert.equal(dateCaption(period),'');assert.equal(displayTitle(period),'客户送测');
});
test('legacy date prefixes migrate once, including known seed titles moved earlier',()=>{
  const e={title:'11.30 客户送测',start:'2026-12-02'};migrateDateTitle(e,'2026-11-30');assert.equal(e.title,'客户送测');assert.equal(e.showDate,true);
  e.title='11.30 是项目编号';migrateDateTitle(e,'2026-11-30');assert.equal(e.title,'11.30 是项目编号');
  const noSpace={title:'11.22开发完成',start:'2026-11-22'};migrateDateTitle(noSpace);assert.equal(noSpace.title,'开发完成');
  const version={title:'2.1 协议升级',start:'2026-11-22'};migrateDateTitle(version);assert.equal(version.title,'2.1 协议升级');
});
test('drag dates stay synchronized across year boundaries with duration unchanged',()=>{
  const original={...base,start:'2026-12-29',end:'2027-01-03',type:'period',showDate:true},e={...original};
  shiftEventDates(e,original,5);assert.equal(e.start,'2027-01-03');assert.equal(e.end,'2027-01-08');assert.equal(dateCaption(e),'2027-01-03 → 2027-01-08');
  shiftEventDates(e,original,-2);assert.equal(e.start,'2026-12-27');assert.equal(e.end,'2027-01-01');
  const milestone={...base,end:''};shiftEventDates(milestone,milestone,1);assert.equal(milestone.end,'');
});
test('date labels participate in collision dimensions and hide without stale spacing',()=>{
  const e={...base,title:'短标题',showDate:true,datePosition:'top'};const shown=measure(e,x);e.showDate=false;const hidden=measure(e,x);
  assert.ok(shown.height>hidden.height);assert.ok(shown.width>hidden.width);
});
test('right-side date fields and title preview update live without rebuilding form',()=>{
  const fields={start:{value:''},end:{value:''},preview:{textContent:''}};
  const root={querySelector:s=>s.includes('"start"')?fields.start:s.includes('"end"')?fields.end:fields.preview};
  const original={...base,type:'period',start:'2026-11-30',end:'2026-12-04',showDate:true,title:'验证'},e={...original};
  shiftEventDates(e,original,3);syncEventDateFields(root,e);assert.equal(fields.start.value,'2026-12-03');assert.equal(fields.end.value,'2026-12-07');assert.equal(fields.preview.textContent,'2026-12-03 → 2026-12-07 · 验证');
  e.showDate=false;syncEventDateFields(root,e);assert.equal(fields.preview.textContent,'验证');assert.equal(fields.start.value,'2026-12-03');
});
test('group date range changes immediately as all members move together',()=>{
  const events=[{...base,start:'2026-11-28'},{...base,type:'period',start:'2026-11-30',end:'2026-12-03'}];
  assert.equal(groupDateRange(events),'2026-11-28 → 2026-12-03');
  for(const e of events)shiftEventDates(e,{...e},4);
  assert.equal(groupDateRange(events),'2026-12-02 → 2026-12-07');
});

import {normalizeProject,metadata,toggleSelection,selectionFromIds,selectedIds,groupSummary,applyBatch,hitsInRectangle,dragMode,resizeDates} from '../dist/project.mjs';
import {harness} from './app-harness.mjs';
test('project fields migrate without inventing task completion or owners',()=>{
  const state={events:[{...base,status:'bogus',owner:9}],groups:[{id:'g'}]};normalizeProject(state);
  assert.equal(state.events[0].status,'pending');assert.equal(state.events[0].owner,'');assert.equal(state.groups[0].collapsed,false);
  assert.equal(metadata({...base,status:'blocked',owner:'张工',showStatus:true,showOwner:true}),'! 阻塞 · 张工');
});
test('multi-selection toggles exactly one member and collapses to a single selection',()=>{
  let s=toggleSelection(null,'a');assert.deepEqual(s,{kind:'event',id:'a'});s=toggleSelection(s,'b');assert.deepEqual(selectedIds(s),['a','b']);s=toggleSelection(s,'a');assert.deepEqual(s,{kind:'event',id:'b'});assert.equal(toggleSelection(s,'b'),null);
});
test('batch updates only selected nodes and keeps period duration',()=>{
  const state={groups:[{id:'g',side:-1}],events:[{...base,id:'a',end:'2026-11-13',type:'period'},{...base,id:'b'},{...base,id:'c'}]};
  applyBatch(state,['a','b'],{days:3,status:'active',owner:'李工',group:'g'});
  assert.equal(state.events[0].end,'2026-11-16');assert.equal(state.events[0].start,'2026-11-13');assert.equal(state.events[1].owner,'李工');assert.equal(state.events[1].side,-1);assert.equal(state.events[2].start,base.start);assert.equal(state.events[2].owner,undefined);
});
test('layout drag cannot change dates, Shift date drag cannot move layout',()=>{
  assert.equal(dragMode({hasElement:true}),'layout');assert.equal(dragMode({hasElement:true,shift:true}),'date');assert.equal(dragMode({hasElement:true,locked:true}),null);assert.equal(dragMode({hasElement:true,locked:true,shift:true}),'date');assert.equal(dragMode({handle:'end'}),'resize-end');
});
test('period handles clamp to valid ranges',()=>{
  const e={...base,type:'period',end:'2026-11-20'},original={...e};resizeDates(e,original,50,'start');assert.equal(e.start,e.end);resizeDates(e,original,-50,'end');assert.equal(e.end,e.start);
});
test('collapsed groups hide children and show progress without deleting data',()=>{
  const events=[{...base,id:'a',group:'g',status:'done',showStatus:true},{...base,id:'b',group:'g',status:'active'}],groups=[{id:'g',name:'研发',side:1,collapsed:true}];
  const l=layout(events,groups,x,8);assert.equal(l.positions.size,0);assert.equal(l.boxes.get('g').bottom-l.boxes.get('g').top,88);assert.deepEqual(groupSummary(events),{total:2,done:1,percent:50});groups[0].collapsed=false;assert.equal(layout(events,groups,x,8).positions.size,2);
});
test('locked nodes retain vertical coordinates during packing and disclose conflicts',()=>{
  const events=[{...base,id:'a',locked:true,manual:true,offset:180},{...base,id:'b',manual:true,offset:180}];let l=layout(events,[],x,8);assert.equal(l.positions.get('a').offset,180);assert.ok(l.positions.get('b').offset>180);
  events[1].locked=true;l=layout(events,[],x,8);assert.equal(l.positions.get('b').offset,180);assert.ok(l.conflicts.includes('b'));
});
test('marquee hit test only selects visible event rectangles',()=>{
  const ps=new Map([['a',{left:10,right:40,offset:50,side:1,height:20}],['b',{left:100,right:150,offset:50,side:1,height:20}]]);
  assert.deepEqual(hitsInRectangle({left:0,right:50,top:130,bottom:170},ps,100),['a']);
});
test('app boots, batch panel applies changes and one undo restores all members',()=>{
  const h=harness();assert.equal(h.run('state.events.length'),16);
  h.run("select({kind:'multi',ids:['e0','e1']})");h.get('batchStatus').value='done';h.get('batchOwnerApply').checked=true;h.get('batchOwner').value='张工';h.get('batchDays').value='2';h.get('batchApply').onclick();
  assert.equal(h.run("state.events.find(e=>e.id==='e0').status"),'done');assert.equal(h.run("state.events.find(e=>e.id==='e1').owner"),'张工');assert.equal(h.run('undo.length'),1);
  h.run('history(undo,redo)');assert.equal(h.run("state.events.find(e=>e.id==='e0').status"),'pending');assert.equal(h.run("state.events.find(e=>e.id==='e1').start"),'2026-11-22');
});
test('actual app dragging separates layout and date mutations with live sidebar sync',()=>{
  const h=harness();h.run("select({kind:'event',id:'e12'})");let target=h.get('canvas').all().find(e=>e.dataset.id==='e12');
  const start=h.run("state.events.find(e=>e.id==='e12').start");h.fire('pointerdown',{target,clientX:300,clientY:300});h.fire('pointermove',{clientX:370,clientY:340});assert.equal(h.run("state.events.find(e=>e.id==='e12').start"),start);h.fire('pointerup',{});
  const oldOffset=h.run("state.events.find(e=>e.id==='e12').offset");target=h.get('canvas').all().find(e=>e.dataset.id==='e12');h.fire('pointerdown',{target,shiftKey:true,clientX:300,clientY:300});h.fire('pointermove',{clientX:370,clientY:450});
  assert.equal(h.run("state.events.find(e=>e.id==='e12').start"),'2026-12-10');assert.equal(h.run("state.events.find(e=>e.id==='e12').offset"),oldOffset);
  assert.equal(h.run("document.querySelector('#editor').querySelector('[data-field=\"start\"]').value"),'2026-12-10');h.fire('pointerup',{});
});
test('actual app lock, compact, and collapse preserve task data',()=>{
  const h=harness();h.run("select({kind:'event',id:'e12'})");h.get('positionLock').onchange({target:{checked:true}});const offset=h.run("computed.positions.get('e12').offset");h.run('compact()');assert.equal(h.run("computed.positions.get('e12').offset"),offset);
  h.run("toggleGroup('g2')");assert.equal(h.run("computed.positions.has('e3')"),false);assert.equal(h.run("state.events.filter(e=>e.group==='g2').length"),7);
  h.run("toggleGroup('g2')");assert.equal(h.run("computed.positions.has('e3')"),true);
});

test('actual multi-node date drag updates all selected nodes in one history step',()=>{
  const h=harness();h.run("select({kind:'multi',ids:['e12','e15']})");const target=h.get('canvas').all().find(e=>e.dataset.id==='e12');
  h.fire('pointerdown',{target,shiftKey:true,clientX:200,clientY:300});h.fire('pointermove',{clientX:270,clientY:450});h.fire('pointermove',{clientX:340,clientY:400});h.fire('pointerup',{});
  assert.equal(h.run('undo.length'),1);assert.equal(h.run("state.events.find(e=>e.id==='e12').start"),'2026-12-20');assert.equal(h.run("state.events.find(e=>e.id==='e15').start"),'2027-01-19');
  h.run('history(undo,redo)');assert.equal(h.run("state.events.find(e=>e.id==='e12').start"),'2026-11-30');
});
test('actual group layout drag preserves dates; collapsed group date drag shifts hidden members',()=>{
  const h=harness();let target=h.get('canvas').all().find(e=>e.dataset.group==='g2');h.fire('pointerdown',{target,clientX:200,clientY:300});h.fire('pointermove',{clientX:500,clientY:340});h.fire('pointerup',{});assert.equal(h.run("state.events.find(e=>e.id==='e3').start"),'2026-09-30');
  h.run("toggleGroup('g2')");target=h.get('canvas').all().find(e=>e.dataset.group==='g2');h.fire('pointerdown',{target,shiftKey:true,clientX:200,clientY:300});h.fire('pointermove',{clientX:270,clientY:450});h.fire('pointerup',{});
  assert.equal(h.run("state.events.find(e=>e.id==='e3').start"),'2026-10-10');assert.equal(h.run("state.groups.find(g=>g.id==='g2').collapsed"),true);
});
test('actual time-period resize does not cross its other endpoint',()=>{
  const h=harness();h.run("add(20757,'period')");const id=h.run('selected.id');const originalEnd=h.run('currentEvent().end');
  const el=h.get('canvas').all().find(e=>e.dataset.id===id),handle=el.children.find(e=>e.dataset.resize==='start');
  h.fire('pointerdown',{target:handle,clientX:200,clientY:300});h.fire('pointermove',{clientX:9000,clientY:300});h.fire('pointerup',{});assert.equal(h.run('currentEvent().start'),originalEnd);assert.equal(h.run('currentEvent().end'),originalEnd);
});
test('actual Ctrl marquee selects visible cards without consuming undo history',()=>{
  const h=harness();const svg=h.get('canvas');h.fire('pointerdown',{target:svg,ctrlKey:true,clientX:-10000,clientY:-10000});h.fire('pointermove',{clientX:10000,clientY:10000});h.fire('pointerup',{});
  assert.equal(h.run('selected.kind'),'multi');assert.equal(h.run('selected.ids.length'),16);assert.equal(h.run('undo.length'),0);
});

import {labelMetrics,labelCoordinates,groupStyle} from '../dist/presentation.mjs';
test('tracking fields are hidden by default while retaining status and owner data',()=>{
  const state={events:[{...base,status:'active',owner:'张工'}],groups:[]};normalizeProject(state);const e=state.events[0];
  assert.equal(e.showStatus,false);assert.equal(e.showOwner,false);assert.equal(e.status,'active');assert.equal(e.owner,'张工');assert.equal(metadata(e),'');
  e.showStatus=true;assert.equal(metadata(e),'◐ 进行中');e.showStatus=false;e.showOwner=true;assert.equal(metadata(e),'张工');
});
test('all four date placements have consistent geometry and preview ordering',()=>{
  const e={...base,title:'交付',showDate:true};
  for(const position of ['left','right','top','bottom']){
    e.datePosition=position;const m=labelMetrics(e),p=labelCoordinates(e,Math.max(65,m.baseWidth),m);
    if(position==='left'){assert.ok(p.dateX<p.titleX);assert.equal(p.dateY,p.titleY);}
    if(position==='right'){assert.ok(p.dateX>p.titleX);assert.equal(p.dateY,p.titleY);assert.equal(displayTitle(e),'交付 · 2026-11-10');}
    if(position==='top')assert.ok(p.dateY<p.titleY);
    if(position==='bottom')assert.ok(p.dateY>p.titleY);
  }
  e.datePosition='left';const horizontal=measure(e,x);e.datePosition='top';assert.ok(horizontal.height<measure(e,x).height);
});
test('horizontal date and aligned title reserve separate regions including link badges',()=>{
  for(const position of ['left','right'])for(const align of ['left','center','right']){
    const e={...base,title:'研发交付',showDate:true,datePosition:position,align,url:'https://example.com',locked:true};const m=labelMetrics(e),p=labelCoordinates(e,m.baseWidth,m);
    const titleWidth=Array.from(e.title).length*12;
    const left=p.titleAnchor==='start'?p.titleX:p.titleAnchor==='end'?p.titleX-titleWidth:p.titleX-titleWidth/2;
    const right=left+titleWidth;
    if(position==='left')assert.ok(left>=p.dateX+m.dateWidth+8);
    else assert.ok(right<=p.dateX-m.dateWidth-8);
  }
});
test('group colors and full transparency normalize safely with readable foregrounds',()=>{
  const state={events:[],groups:[{id:'g',name:'组',color:'#000000',opacity:1}]};normalizeProject(state);assert.equal(groupStyle(state.groups[0]).text,'#ffffff');
  state.groups[0].opacity=0;assert.equal(groupStyle(state.groups[0]).opacity,0);assert.equal(groupStyle(state.groups[0]).text,'#42583e');
  const invalid={color:'javascript:bad',opacity:8};const style=groupStyle(invalid);assert.equal(style.color,'#e8ede2');assert.equal(style.opacity,1);
});
test('group automatic row gaps shrink to 2px while standalone spacing remains unchanged',()=>{
  const events=[{...base,id:'a',group:'g'},{...base,id:'b',group:'g'},{...base,id:'c',group:'g'}],groups=[{id:'g',name:'组',side:1}];
  const l=layout(events,groups,x,8),ps=[...l.positions.values()].sort((a,b)=>a.offset-b.offset);
  for(let i=1;i<ps.length;i++)assert.equal(ps[i].offset-ps[i-1].offset-(ps[i].height+ps[i-1].height)/2,2);
});
test('actual sidebar toggles tracking display, date placement and group style with undo',()=>{
  const h=harness();h.run("select({kind:'event',id:'e12'})");assert.equal(h.get('showStatus').checked,false);assert.equal(h.get('showOwner').checked,false);
  h.get('showStatus').onchange({target:{checked:true}});assert.equal(h.run('currentEvent().showStatus'),true);
  h.run("document.querySelector('#editor').querySelector('[data-field=\"datePosition\"]').value='right';document.querySelector('#editor').querySelector('[data-field=\"datePosition\"]').onchange()");assert.equal(h.run('currentEvent().datePosition'),'right');
  h.run("select({kind:'group',id:'g1'})");h.get('groupColor').onchange({target:{value:'#000000'}});assert.equal(h.run("state.groups[0].color"),'#000000');
  h.get('groupTransparency').oninput({target:{value:'100'}});h.get('groupTransparency').onchange({target:{value:'100'}});assert.equal(h.run('state.groups[0].opacity'),0);assert.equal(h.get('groupTransparencyValue').textContent,'100%');
  const g=h.get('canvas').all().find(e=>e.dataset.group==='g1');assert.equal(g.children[0].attrs['fill-opacity'],'0');
  h.run('history(undo,redo)');assert.equal(h.run('state.groups[0].opacity'),.75);
});
test('batch visibility and date placement preserve underlying task values',()=>{
  const state={groups:[],events:[{...base,id:'a',status:'done',owner:'张工',showStatus:true,showOwner:true},{...base,id:'b',status:'active',owner:'李工'}]};
  applyBatch(state,['a','b'],{showStatus:false,showOwner:false,datePosition:'bottom'});
  assert.equal(state.events[0].status,'done');assert.equal(state.events[1].owner,'李工');assert.equal(metadata(state.events[0]),'');assert.equal(state.events[1].datePosition,'bottom');
});

import {FONTS,COLORS,LAYOUT_PRESETS,normalizeFormatting,normalizeLayout,textAttrs,textStyle,groupMetrics} from '../dist/formatting.mjs';
test('progress defaults hidden and never derives completion from the date',()=>{
  const state={groups:[],events:[{...base,type:'period',end:'2026-11-20'}]};normalizeFormatting(state);assert.equal(state.events[0].showProgress,false);assert.equal(state.events[0].progress,0);
  const hidden=measure(state.events[0],x);state.events[0].showProgress=true;state.events[0].progress=40;const shown=measure(state.events[0],x);assert.ok(shown.height>hidden.height);assert.equal(state.events[0].progress,40);
});
test('typography uses whitelisted fonts and SVG text attributes',()=>{
  const e={...base,textStyles:{title:{font:'georgia',size:24,bold:true,italic:true,underline:true,color:'#4472c4'}}};const attrs=textAttrs(e,'title');assert.equal(attrs['font-weight'],'700');assert.equal(attrs['font-style'],'italic');assert.equal(attrs['text-decoration'],'underline');assert.equal(attrs['font-size'],24);assert.equal(attrs.fill,'#4472c4');
  const normal=measure({...base,textStyles:{}},x),large=measure(e,x);assert.ok(large.height>normal.height);assert.ok(large.width>normal.width);assert.ok(Object.keys(FONTS).length>=10);
});
test('large group typography expands heading reservation and collapsed geometry',()=>{
  const g={id:'g',name:'项目分组',side:1,collapsed:true,textStyles:{name:{font:'simsun',size:36,bold:true},range:{size:24},summary:{size:24}}};const metrics=groupMetrics(g,true);const l=layout([{...base,id:'a',group:'g',showStatus:true}], [g],x,8);assert.equal(l.boxes.get('g').bottom-l.boxes.get('g').top,metrics.height);assert.ok(metrics.head>=60);
});
test('global layout spacing affects groups and standalone blocks with zero supported',()=>{
  const events=[{...base,id:'a',group:'g'},{...base,id:'b',group:'g'}],groups=[{id:'g',name:'组',side:1}];
  const tight=layout(events,groups,x,8,null,LAYOUT_PRESETS.compact),loose=layout(events,groups,x,8,null,LAYOUT_PRESETS.loose);
  assert.ok(loose.below>tight.below);const ps=[...tight.positions.values()].sort((a,b)=>a.offset-b.offset);assert.equal(ps[1].offset-ps[0].offset,(ps[0].height+ps[1].height)/2);
  assert.equal(normalizeLayout(null).rowGap,2);assert.equal(normalizeLayout({rowGap:-10,blockGap:999}).rowGap,0);assert.equal(normalizeLayout({blockGap:999}).blockGap,60);
});
test('20-color palette has distinct Office-style theme choices',()=>{
  assert.equal(COLORS.length,20);assert.equal(new Set(COLORS).size,20);assert.ok(COLORS.includes('#ffffff'));assert.ok(COLORS.includes('#000000'));for(const c of COLORS)assert.match(c,/^#[0-9a-f]{6}$/);
});
test('actual progress control toggles a filled track and preserves percentage while dragging',()=>{
  const h=harness();h.run("add(20757,'period')");const id=h.run('selected.id');let el=h.get('canvas').all().find(e=>e.dataset.id===id);assert.equal(el.children.some(e=>e.dataset.progress),false);
  h.get('showProgress').onchange({target:{checked:true}});h.run("document.querySelector('#editor').querySelector('[data-field=\"progress\"]').value='40';document.querySelector('#editor').querySelector('[data-field=\"progress\"]').onchange()");
  el=h.get('canvas').all().find(e=>e.dataset.id===id);const track=el.children.find(e=>e.dataset.progress);assert.equal(track.attrs['aria-valuenow'],'40');assert.ok(Math.abs(Number(track.children[1].attrs.width)/Number(track.children[0].attrs.width)-.4)<1e-10);
  h.fire('pointerdown',{target:el,shiftKey:true,clientX:200,clientY:300});h.fire('pointermove',{clientX:270,clientY:300});h.fire('pointerup',{});assert.equal(h.run('currentEvent().progress'),40);
  h.get('showProgress').onchange({target:{checked:false}});assert.equal(h.run('currentEvent().progress'),40);assert.equal(h.get('canvas').all().find(e=>e.dataset.id===id).children.some(e=>e.dataset.progress),false);
});
test('actual palettes expose 20 choices and apply a color with undo support',()=>{
  const h=harness();h.run("select({kind:'event',id:'e12'})");const input=h.run("document.querySelector('#editor').querySelector('[data-field=\"color\"]')");assert.equal(input.paletteElement.children.length,20);input.paletteElement.children[19].onclick();assert.equal(h.run('currentEvent().color'),COLORS[19]);h.run('history(undo,redo)');assert.equal(h.run("state.events.find(e=>e.id==='e12').color"),'#c65d42');
});
test('actual format dialog updates node text, group name and project title',()=>{
  const h=harness();h.run("select({kind:'event',id:'e12'});openFormat()");h.get('fontFamily').value='georgia';h.get('fontSize').value='24';h.get('fontBold').checked=true;h.get('fontItalic').checked=true;h.get('fontUnderline').checked=true;h.get('formatForm').onsubmit({preventDefault(){}});
  assert.equal(h.run('currentEvent().textStyles.title.font'),'georgia');const node=h.get('canvas').all().find(e=>e.dataset.id==='e12'),title=node.children.find(e=>e.tagName==='TEXT'&&e.textContent==='客户送测');assert.equal(title.attrs['font-size'],'24');assert.equal(title.attrs['font-style'],'italic');assert.equal(title.attrs['text-decoration'],'underline');
  h.run("select({kind:'group',id:'g1'});openFormat()");h.get('fontFamily').value='arial';h.get('fontSize').value='20';h.get('formatForm').onsubmit({preventDefault(){}});assert.equal(h.run("state.groups[0].textStyles.name.size"),20);
  h.run('select(null);openFormat()');h.get('fontFamily').value='kaiti';h.get('fontSize').value='18';h.get('formatForm').onsubmit({preventDefault(){}});assert.equal(h.run('state.textStyles.projectTitle.font'),'kaiti');assert.equal(h.get('projectTitle').style.fontSize,'18px');
});
test('actual multi-selection format applies to selected nodes only',()=>{
  const h=harness();h.run("select({kind:'multi',ids:['e0','e1']});openFormat()");h.get('fontFamily').value='simsun';h.get('fontSize').value='16';h.get('fontBold').checked=true;h.get('formatForm').onsubmit({preventDefault(){}});assert.equal(h.run('state.events[0].textStyles.title.bold'),true);assert.equal(h.run('state.events[1].textStyles.title.size'),16);assert.equal(h.run('state.events[2].textStyles.title'),undefined);
});
test('actual layout dialog presets and apply preserve locked positions and undo state',()=>{
  const h=harness();h.run("select({kind:'event',id:'e12'})");h.get('positionLock').onchange({target:{checked:true}});const offset=h.run("computed.positions.get('e12').offset");h.get('layoutSettings').onclick();
  const loose=h.get('layoutDialog').querySelectorAll('[data-density]').find(e=>e.dataset.density==='loose');loose.onclick();assert.equal(h.get('layoutRowGap').value,12);h.get('layoutAxisGap').value='100';h.get('layoutForm').onsubmit({preventDefault(){}});
  assert.equal(h.run('state.layout.rowGap'),12);assert.equal(h.run("computed.positions.get('e12').offset"),offset);h.run('history(undo,redo)');assert.equal(h.run('state.layout.rowGap'),2);
});

test('inline title edit commits once, cancels safely, and undo restores content',()=>{
  const h=harness();
  h.run(`select({kind:'event',id:'e0'});beginInline(svg.querySelector('[data-inline="title"]'));inlineSession.box.value='原位编辑新标题';finishInline();`);
  assert.equal(h.run('state.events[0].title'),'原位编辑新标题');
  assert.equal(h.run('undo.length'),1);
  h.run(`beginInline(svg.querySelector('[data-inline="title"]'));inlineSession.box.value='取消内容';finishInline(true);`);
  assert.equal(h.run('state.events[0].title'),'原位编辑新标题');
  h.run('history(undo,redo)');assert.notEqual(h.run('state.events[0].title'),'原位编辑新标题');
});
test('floating controls update text and shape, persist, and retain undo',()=>{
  const h=harness();h.run(`select({kind:'event',id:'e0'});changeText({bold:true,font:'kaiti'});control('opacity').onchange({target:{value:'60'}});control('shape').onchange({target:{value:'square'}});`);
  assert.equal(h.run('state.events[0].textStyles.title.bold'),true);
  assert.equal(h.run('state.events[0].opacity'),.4);
  assert.equal(h.run('state.events[0].design'),'square');
  h.run('history(undo,redo)');assert.notEqual(h.run('state.events[0].design'),'square');
  assert.equal(h.run(`JSON.parse(localStorage.getItem('osa-timeline-v1')).events[0].opacity`),.4);
});


test('outside pointer closes date inputs even without blur, while preserving edits',()=>{
 const h=harness();h.run(`select({kind:'event',id:'e0'});beginInline(svg.querySelector('[data-inline="date"]'));inlineSession.box.value='2026-10-16';outsideEditorPointer({target:svg});`);
 assert.equal(h.run('inlineSession'),null);assert.equal(h.run('state.events[0].start'),'2026-10-16');
 h.run(`beginInline(svg.querySelector('[data-inline="date"]'));outsideEditorPointer({target:inlineSession.box});`);assert.equal(h.run('!!inlineSession'),true);
});
test('Ctrl wheel scales whole page without changing date scale and fixes coordinates',()=>{
 const h=harness(),before=h.run('view.ppd');h.run(`pageWheel({ctrlKey:true,deltaY:-100,deltaMode:0,preventDefault(){},stopPropagation(){}});`);
 assert.ok(h.run('pageScale')>1);assert.equal(h.run('view.ppd'),before);assert.equal(h.run('document.body.style.zoom'),String(h.run('pageScale')));
 assert.ok(Math.abs(h.run('pointerX({clientX:200})*pageScale')-200)<1e-8);
 h.run(`pageWheel({ctrlKey:true,deltaY:100,deltaMode:0,preventDefault(){},stopPropagation(){}});`);assert.ok(Math.abs(h.run('pageScale')-1)<1e-8);
});
test('floating palettes open exclusively and dismiss on outside click',()=>{
 const h=harness();h.run(`select({kind:'event',id:'e0'});const palettes=office.querySelectorAll('details');palettes[0].open=true;palettes[1].open=true;closeFloatingPalettes(palettes[1]);`);
 assert.equal(h.run(`office.querySelectorAll('details')[0].open`),false);assert.equal(h.run(`office.querySelectorAll('details')[1].open`),true);
 h.run('outsideEditorPointer({target:svg})');assert.equal(h.run(`office.querySelectorAll('details').some(d=>d.open)`),false);
});


test('element shortcuts copy and paste multi-selection once, delete and undo safely',()=>{
 const h=harness();h.run(`select({kind:'multi',ids:['e0','e1']});elementShortcut({key:'c',ctrlKey:true,preventDefault(){}});elementShortcut({key:'v',ctrlKey:true,preventDefault(){}});`);
 assert.equal(h.run('state.events.length'),18);assert.equal(h.run('undo.length'),1);assert.equal(h.run('new Set(state.events.map(e=>e.id)).size'),18);
 assert.equal(h.run('state.events[16].start'),h.run('state.events[0].start'));
 h.run(`elementShortcut({key:'Delete',preventDefault(){}});`);assert.equal(h.run('state.events.length'),16);
 h.run('history(undo,redo)');assert.equal(h.run('state.events.length'),18);
});
test('hidden elements leave layout and reappear after undo, with data retained',()=>{
 const h=harness();h.run(`select(null);document.querySelector('[data-visibility="e0"]').onclick();`);
 assert.equal(h.run('state.events.length'),16);assert.equal(h.run("computed.positions.has('e0')"),false);
 assert.equal(h.run('state.events[0].hidden'),true);h.run('history(undo,redo)');assert.equal(h.run("computed.positions.has('e0')"),true);
});
test('element list pin survives selection and new events default left dates',()=>{
 const h=harness();assert.equal(h.get('elementList').hidden,false);
 h.get('pinElementList').onclick();h.run(`select({kind:'event',id:'e0'});`);assert.equal(h.get('elementList').hidden,false);
 h.get('pinElementList').onclick();assert.equal(h.get('elementList').hidden,true);
 assert.equal(h.run("makeEvent(undefined,'period').datePosition"),'left');
 h.run(`select(null);`);assert.equal(h.get('elementList').hidden,false);
});
test('project icons change measured titles and persist with undo',()=>{
 const h=harness();h.run(`select({kind:'event',id:'e0'});$('#eventIcon').onchange({target:{value:'🏁'}});`);
 assert.equal(h.run('state.events[0].icon'),'🏁');assert.ok(h.run("labelMetrics(state.events[0]).title.startsWith('🏁')"));
 h.run('history(undo,redo)');assert.equal(h.run('!!state.events[0].icon'),false);
});


test('node list sorts by start, end and title without mutating stored order',()=>{
 const h=harness();h.run(`state.events[0].start='2027-12-31';state.events[1].start='2026-01-01';render();`);
 assert.equal(h.run('sortedEvents()[0].id'),'e1');assert.equal(h.run('state.events[0].id'),'e0');
 const markup=h.get('elementList').innerHTML;assert.ok(markup.indexOf('data-list-select="e1"')<markup.indexOf('data-list-select="e0"'));
});
test('project fields record real changes and named versions survive JSON restore',()=>{
 const h=harness();h.get('infoOwner').onchange({target:{value:'项目经理'}});assert.equal(h.run('state.projectInfo.owner'),'项目经理');assert.equal(h.run('state.revisions.length'),1);
 h.get('infoVersion').value='V1.2';h.get('revisionNote').value='评审通过';h.get('recordVersion').onclick();
 assert.equal(h.run('state.revisions.at(-1).summary'),'评审通过');assert.equal(h.run('state.revisions.at(-1).version'),'V1.2');
 assert.equal(h.run('normalize(JSON.parse(JSON.stringify(state))).revisions.at(-1).summary'),'评审通过');
});
test('floating label drags freely without dates or layout changes, with undo',()=>{
 const h=harness(),before=h.run('JSON.stringify([...computed.positions])');h.run(`addFloating();const label=state.floatingLabels[0];startFloatingDrag({preventDefault(){},clientX:100,clientY:100,pointerId:1},svg.querySelector('[data-floating]'));moveFloating({preventDefault(){},clientX:160,clientY:145});endDrag();`);
 assert.equal(h.run('state.floatingLabels[0].x'),500);assert.equal(h.run('state.floatingLabels[0].y'),125);
 assert.equal(h.run('state.floatingLabels[0].start'),undefined);assert.equal(h.run('JSON.stringify([...computed.positions])'),before);
 h.run('history(undo,redo)');assert.equal(h.run('state.floatingLabels[0].x'),440);
});
test('floating labels copy paste delete independently and ignore timeline zoom',()=>{
 const h=harness();h.run(`addFloating();copyElements();pasteElements();`);assert.equal(h.run('state.floatingLabels.length'),2);assert.equal(h.run('state.events.length'),16);
 const x=h.run('state.floatingLabels[1].x');h.run('zoom(1.5)');assert.equal(h.run('state.floatingLabels[1].x'),x);
 h.run('deleteElements()');assert.equal(h.run('state.floatingLabels.length'),1);h.run('history(undo,redo)');assert.equal(h.run('state.floatingLabels.length'),2);
});

test('floating icon selector applies to nodes, groups and free labels with undo',()=>{
 const h=harness();h.run(`select({kind:'event',id:'e0'});control('icon').onchange({target:{value:'🚩'}});`);
 assert.equal(h.run('state.events[0].icon'),'🚩');assert.equal(h.run("control('icon').value"),'🚩');
 h.run(`select({kind:'group',id:'g1'});control('icon').onchange({target:{value:'🏁'}});`);assert.equal(h.run('state.groups[0].icon'),'🏁');
 h.run(`addFloating();control('icon').onchange({target:{value:'🎯'}});`);assert.equal(h.run('state.floatingLabels[0].icon'),'🎯');
 h.run('history(undo,redo)');assert.equal(h.run('!!state.floatingLabels[0].icon'),false);
});
test('selected group toggles clicked text membership, preserves dates and exits on blank',()=>{
 const h=harness();const dateBefore=h.run('state.events[0].start');h.run(`select({kind:'group',id:'g2'});`);
 h.fire('pointerdown',{target:h.run(`svg.querySelector('[data-id="e0"]').querySelector('[data-inline="title"]')`),clientX:40,clientY:40});
 assert.equal(h.run('state.events[0].group'),'g2');assert.equal(h.run('selected.id'),'g2');assert.equal(h.run('state.events[0].start'),dateBefore);assert.equal(h.run('inlineSession'),null);
 h.fire('pointerup',{});
 h.fire('pointerdown',{target:h.run(`svg.querySelector('[data-id="e0"]')`),clientX:40,clientY:40});assert.equal(h.run('state.events[0].group'),'');h.fire('pointerup',{});
 h.run('history(undo,redo)');assert.equal(h.run('state.events[0].group'),'g2');
 h.run(`select({kind:'group',id:'g2'});`);h.fire('pointerdown',{target:h.get('canvas'),clientX:900,clientY:500});h.fire('pointerup',{});assert.equal(h.run('selected'),null);
});
test('revision policy retains all TAGs and exactly the latest 50 automatic records',()=>{
 const h=harness();h.run(`state.revisions=Array.from({length:150},(_,i)=>({id:String(i),kind:i%2?'auto':'tag',time:'2026-10-17T00:00:00Z',summary:'record '+i}));state=normalize(state);`);
 assert.equal(h.run("state.revisions.filter(r=>r.kind==='auto').length"),50);assert.equal(h.run("state.revisions.filter(r=>r.kind==='tag').length"),75);
 assert.equal(h.run("state.revisions.filter(r=>r.kind==='auto')[0].id"),'51');
 h.get('infoOwner').onchange({target:{value:'测试负责人'}});assert.equal(h.run("state.revisions.filter(r=>r.kind==='auto').length"),50);
 h.get('revisionNote').value='永久保留的说明';h.get('recordVersion').onclick();assert.equal(h.run("state.revisions.filter(r=>r.kind==='tag').length"),76);
 assert.equal(h.run("normalize(JSON.parse(JSON.stringify(state))).revisions.filter(r=>r.kind==='tag').length"),76);
});
test('legacy manual revision descriptions migrate to TAGs without guessing them away',()=>{
 const h=harness();h.run(`state.revisions=[{time:'2026-10-17',summary:'评审通过',version:'V1'},{time:'2026-10-17',summary:'新增 2 个节点',version:'V1'},{time:'2026-10-17',summary:'手动记录当前版本'}];state=normalize(state);`);
 assert.equal(h.run('state.revisions[0].kind'),'tag');assert.equal(h.run('state.revisions[1].kind'),'auto');assert.equal(h.run('state.revisions[2].kind'),'tag');
});

test('select-all button and shortcut select hidden nodes, groups and floating labels',()=>{
 const h=harness();h.run(`addFloating();state.events[0].hidden=true;state.groups[0].collapsed=true;`);h.get('selectAll').onclick();
 assert.equal(h.run('selected.kind'),'all');assert.equal(h.run('selected.ids.length'),16);assert.equal(h.run('selected.groupIds.length'),3);assert.equal(h.run('selected.floatingIds.length'),1);
 h.run(`select(null);elementShortcut({key:'a',ctrlKey:true,preventDefault(){}});`);assert.equal(h.run('selected.kind'),'all');
});
test('global font size preserves differences and styling, changes all types and undoes once',()=>{
 const h=harness();h.run(`addFloating();state.events[0].hidden=true;state.events[0].textStyles.title={font:'kaiti',size:20,bold:true,color:'#123456'};state.groups[0].collapsed=true;`);
 const before=h.run('undo.length'),color=h.run('state.events[0].color');h.get('globalFontUp').onclick();
 assert.equal(h.run('state.events[0].textStyles.title.size'),22);assert.equal(h.run('state.events[1].textStyles.title.size'),14);assert.equal(h.run('state.groups[0].textStyles.name.size'),12);assert.equal(h.run('state.floatingLabels[0].textStyles.title.size'),16);
 assert.equal(h.run('state.events[0].textStyles.title.font'),'kaiti');assert.equal(h.run('state.events[0].textStyles.title.bold'),true);assert.equal(h.run('state.events[0].textStyles.title.color'),'#123456');assert.equal(h.run('state.events[0].color'),color);
 assert.equal(h.run('undo.length'),before+1);h.run('history(undo,redo)');assert.equal(h.run('state.events[0].textStyles.title.size'),20);
});
test('select-all copying and deletion preserve group identity and support undo',()=>{
 const h=harness();h.run(`addFloating();selectAllElements();copyElements();pasteElements();`);
 assert.equal(h.run('state.events.length'),32);assert.equal(h.run('state.groups.length'),6);assert.equal(h.run('state.floatingLabels.length'),2);
 assert.equal(h.run('state.events[16].group'),h.run('state.groups[3].id'));
 h.run('deleteElements()');assert.equal(h.run('state.events.length'),16);assert.equal(h.run('state.groups.length'),3);assert.equal(h.run('state.floatingLabels.length'),1);
 h.run('history(undo,redo)');assert.equal(h.run('state.events.length'),32);
});
test('global font adjustments remain within safe size limits',()=>{
 const h=harness();h.run(`state.events[0].textStyles.title={size:48};state.events[1].textStyles.date={size:8};resizeAllText(2);`);assert.equal(h.run('state.events[0].textStyles.title.size'),48);
 h.run(`state.events[1].textStyles.date={size:8};resizeAllText(-2);`);assert.equal(h.run('state.events[1].textStyles.date.size'),8);
});

test('project panel collapse persists without changing project or undo history',()=>{
 const h=harness(),before=h.run('JSON.stringify(state)'),count=h.run('undo.length');h.get('projectPanelToggle').onclick();
 assert.equal(h.get('projectInfoContent').hidden,true);assert.equal(h.get('projectPanelToggle').attrs['aria-expanded'],'false');assert.equal(h.storage.get('osa-project-panel-collapsed'),'true');assert.equal(h.run('JSON.stringify(state)'),before);assert.equal(h.run('undo.length'),count);
 h.get('projectPanelToggle').onclick();assert.equal(h.get('projectInfoContent').hidden,false);
});
test('explicit group drawing layer always precedes all timeline nodes',()=>{
 const h=harness(),canvas=h.get('canvas'),groups=canvas.querySelector('[data-layer="groups"]'),elements=canvas.querySelector('[data-layer="elements"]');
 assert.ok(canvas.children.indexOf(groups)<canvas.children.indexOf(elements));assert.equal(groups.querySelectorAll('[data-id]').length,0);assert.equal(elements.querySelectorAll('[data-group]').length,0);assert.equal(elements.querySelectorAll('.event').length,16);
});
test('selection tool frames mixed elements and applies font changes to selected items',()=>{
 const h=harness();h.run(`addFloating();setCanvasTool('select');`);
 h.fire('pointerdown',{target:h.get('canvas'),clientX:20,clientY:300,pointerId:1});h.fire('pointermove',{clientX:10000,clientY:10000});h.fire('pointerup',{});
 assert.equal(h.run('selected.kind'),'all');assert.equal(h.run('selected.scope'),'rectangle');assert.equal(h.run('selected.floatingIds.length'),1);
 h.run(`selected={kind:'all',scope:'rectangle',ids:['e0'],groupIds:[],floatingIds:[state.floatingLabels[0].id]};editor();resizeSelectedText(2);`);
 assert.equal(h.run('state.events[0].textStyles.title.size'),14);assert.equal(h.run('state.floatingLabels[0].textStyles.title.size'),16);assert.equal(h.run('state.events[1].textStyles.title'),undefined);
 h.run(`openFormat();$('#formatTarget').value='all';$('#fontFamily').value='kaiti';$('#fontSize').value='18';applyFormat();`);assert.equal(h.run('state.events[0].textStyles.title.font'),'kaiti');assert.equal(h.run('state.floatingLabels[0].textStyles.title.font'),'kaiti');assert.equal(h.run('state.events[1].textStyles.title'),undefined);
});
test('saved version opens independent draft; only confirmed save replaces latest with backup',async()=>{
 const storage=new Map(),latest=harness({storage,href:'https://example.test/'});
 latest.get('infoTitle').onchange({target:{value:'历史 A'}});await latest.run('versionWrites');latest.get('revisionNote').value='评审版';latest.get('recordVersion').onclick();await latest.run('versionWrites');const id=latest.run('state.revisions.at(-1).snapshotId');
 latest.run(`openRevision(${JSON.stringify(id)})`);assert.equal(latest.opened.length,1);assert.ok(latest.opened[0].includes('restore='));
 latest.get('infoTitle').onchange({target:{value:'最新 B'}});await latest.run('versionWrites');const latestBefore=storage.get('osa-timeline-v1');
 const historical=harness({storage,href:`https://example.test/?restore=${id}&draft=separate`});await historical.run('restoreInitialization');assert.equal(historical.run('state.title'),'历史 A');
 historical.get('infoTitle').onchange({target:{value:'历史副本 C'}});await historical.run('versionWrites');assert.equal(storage.get('osa-timeline-v1'),latestBefore);
 await historical.run('saveRestoredVersion()');assert.equal(storage.get('osa-timeline-v1'),latestBefore);
 historical.run('window.confirm=()=>true');await historical.run('saveRestoredVersion()');const committed=JSON.parse(storage.get('osa-timeline-v1'));assert.equal(committed.title,'历史副本 C');
 const backup=committed.revisions.find(r=>r.summary==='覆盖前备份 · 最新项目');assert.ok(backup);const data=await historical.run(`readVersionSnapshot(${JSON.stringify(backup.snapshotId)})`);assert.equal(data.title,'最新 B');
 historical.get('infoTitle').onchange({target:{value:'继续修改独立草稿'}});await historical.run('versionWrites');assert.equal(JSON.parse(storage.get('osa-timeline-v1')).title,'历史副本 C');
});
test('automatic snapshot captures final drag state instead of an intermediate frame',async()=>{
 const h=harness();h.run("select({kind:'event',id:'e12'})");h.fire('pointerdown',{target:h.run(`svg.querySelector('[data-id="e12"]')`),shiftKey:true,clientX:300,clientY:300});h.fire('pointermove',{clientX:335,clientY:300});h.fire('pointermove',{clientX:370,clientY:300});h.fire('pointerup',{});await h.run('versionWrites');
 const id=h.run('state.revisions.at(-1).snapshotId'),data=await h.run(`readVersionSnapshot(${JSON.stringify(id)})`);assert.equal(data.events.find(e=>e.id==='e12').start,h.run(`state.events.find(e=>e.id==='e12').start`));assert.equal(h.run('state.revisions.at(-1).snapshotStatus'),'ready');
});

test('continuous property edits update the same automatic snapshot to final value',async()=>{
 const h=harness();h.run(`select({kind:'group',id:'g1'});`);const slider=h.get('groupTransparency');slider.oninput({target:{value:'20'}});slider.oninput({target:{value:'60'}});slider.onchange({target:{value:'80'}});await h.run('versionWrites');
 const id=h.run('state.revisions.at(-1).snapshotId'),data=await h.run(`readVersionSnapshot(${JSON.stringify(id)})`);assert.ok(Math.abs(data.groups[0].opacity-.2)<1e-8);assert.equal(h.run('state.revisions.length'),1);
});
test('restored save refuses to overwrite a newer edit made during confirmation',async()=>{
 const storage=new Map(),latest=harness({storage,href:'https://example.test/'});latest.get('recordVersion').onclick();await latest.run('versionWrites');const id=latest.run('state.revisions.at(-1).snapshotId');
 const historical=harness({storage,href:`https://example.test/?restore=${id}&draft=race`});await historical.run('restoreInitialization');
 historical.run(`window.confirm=()=>{const newer=JSON.parse(localStorage.getItem('osa-timeline-v1'));newer.title='并发更新';localStorage.setItem('osa-timeline-v1',JSON.stringify(newer));return true;};`);
 await historical.run('saveRestoredVersion()');assert.equal(JSON.parse(storage.get('osa-timeline-v1')).title,'并发更新');
});

test('expanded group hugs member bounds on both sides',()=>{
  for(const side of [-1,1]){
    const g={id:'compact',name:'集成与测试',side};
    const events=[{...base,id:'a',group:g.id,start:'2026-11-22',showDate:true},{...base,id:'b',group:g.id,start:'2026-11-28',showDate:true}];
    for(const padding of [2,6,16]){
      const l=layout(events,[g],x,8,null,{padding}),b=l.boxes.get(g.id),ps=[...l.positions.values()];
      assert.equal(b.left,Math.min(...ps.map(p=>p.left))-padding);
      assert.equal(b.right,Math.max(...ps.map(p=>p.right))+padding);
    }
  }
});
test('expanded group reserves room for long locked heading and toggle',()=>{
  const g={id:'wide',name:'很长的分组标题'.repeat(5),locked:true,side:1,textStyles:{name:{size:24}}};
  const l=layout([{...base,id:'a',group:g.id}],[g],x,8),b=l.boxes.get(g.id);
  assert.ok(b.right-b.left>=groupMetrics(g).minWidth-1e-9);
  assert.ok(groupMetrics({...g,locked:true}).minWidth>groupMetrics({...g,locked:false}).minWidth);
  assert.ok(groupMetrics({...g,name:'短标题',collapsed:true,textStyles:{}}).minWidth>=245);
});

test('floating labels follow canvas pan and dragging after zoom uses canvas coordinates',()=>{
 const h=harness();h.run('addFloating()');
 const before=h.run('floatingPosition(state.floatingLabels[0])');
 h.run('Object.assign(view,panView({start:view.start,ppd:view.ppd,panY:view.panY},120,-35));render()');
 const after=h.run('floatingPosition(state.floatingLabels[0])');
 assert.ok(Math.abs(after.x-before.x-120)<1e-8);assert.equal(after.y,before.y-35);
 h.run(`zoom(1.5);const p=floatingPosition(state.floatingLabels[0]);startFloatingDrag({preventDefault(){},clientX:100,clientY:100,pointerId:1},svg.querySelector('[data-floating]'));moveFloating({preventDefault(){},clientX:160,clientY:145});endDrag();globalThis.labelDelta={x:floatingPosition(state.floatingLabels[0]).x-p.x,y:floatingPosition(state.floatingLabels[0]).y-p.y};`);
 assert.ok(Math.abs(h.run('labelDelta.x')-60)<1e-8);assert.equal(h.run('labelDelta.y'),45);
});
test('floating label double click edits in place with commit cancel and undo',()=>{
 const h=harness();h.run(`addFloating();editFloatingText(state.floatingLabels[0].id);`);
 assert.equal(h.run('inlineSession.item.id'),h.run('state.floatingLabels[0].id'));
 h.run(`inlineSession.box.value='新的标签';finishInline();`);assert.equal(h.run('state.floatingLabels[0].title'),'新的标签');
 h.run(`editFloatingText(state.floatingLabels[0].id);inlineSession.box.value='取消的修改';finishInline(true);`);assert.equal(h.run('state.floatingLabels[0].title'),'新的标签');
 h.run('history(undo,redo)');assert.equal(h.run('state.floatingLabels[0].title'),'悬浮标签');
});
