import {mergedAnchor} from './merged-cells.mjs';
import {planToTimeline} from './plan-to-timeline.mjs';
import {writeVersionSnapshot} from './timeline/versions.mjs';
import {workbookBuffer,readOnlineWorkbook} from './xlsx-export.mjs';
import {historicalProject,toSheets,readSheets,writeResults,text,hideNodeRows} from './sheet-model.mjs';
import {schedule} from './engine.mjs';
import {importExcel} from './excel.mjs';
const $=s=>document.querySelector(s),STORE='planflow.online-sheet.v1',OLD='planflow.project.v1',BACKUP='planflow.online-sheet.backup';
let project,sheets,grid,dirty=false,loading=false,selection={r:0,c:0},callback=null;
const sample=await fetch('./sample.json').then(r=>{if(!r.ok)throw Error('演示模板加载失败');return r.json();});
const history=historicalProject(sample);
try{const raw=localStorage.getItem(STORE);if(raw){const data=JSON.parse(raw);project=data.project;sheets=data.sheets;dirty=!!data.dirty;}else{const old=JSON.parse(localStorage.getItem(OLD)||'null');project=old?.project&&!old.project.templateId?old.project:history;sheets=toSheets(project);}}catch(e){project=history;sheets=toSheets(project);$('#error').hidden=false;$('#error').textContent='本地记录无法读取，已载入演示模板：'+e.message;}
hideNodeRows(sheets);
$('#weekends').checked=!!project.weekends;
function save(){try{localStorage.setItem(STORE,JSON.stringify({project,sheets,dirty}));$('#saved').textContent='已保存 '+new Date().toLocaleTimeString('zh-CN');}catch(e){$('#saved').textContent='保存失败，请立即保存备份';$('#error').hidden=false;$('#error').textContent='浏览器保存失败，点击“保存备份”下载当前内容。';}}
function collect(){sheets=grid.getData();return sheets;}
function selectedSheet(){const i=grid.getData().findIndex(s=>s.name===document.querySelector('.x-spreadsheet-bottombar li.active')?.textContent);return i<0?0:i;}
function refreshInfo(){const parsed=sheets.find(s=>s.name==='原表排期');$('.intro h1').textContent=parsed?text(parsed,0,0):project.name;$('#status').textContent=dirty?'已编辑，点击一键重排更新日期':'日期已刷新 · 共用节点同步';}
function clearSelection(){selection={r:0,c:0};$('#address').textContent='—';$('#cell-value').value='';$('#cell-value').disabled=true;$('#cell-hint').textContent='请先选择单元格';}
function load(data){clearSelection();loading=true;sheets=hideNodeRows(data);grid.loadData(sheets);loading=false;refreshInfo();}
x_spreadsheet.locale('zh-cn');
grid=x_spreadsheet('#spreadsheet',{showToolbar:true,showGrid:true,showContextmenu:true,view:{height:()=>Math.max(460,window.innerHeight-324),width:()=>document.documentElement.clientWidth},row:{len:100,height:29},col:{len:30,width:170,indexWidth:45,minWidth:60},style:{font:{name:'Arial',size:11},valign:'middle',textwrap:true}});
grid.loadData(sheets).change(()=>{if(loading)return;collect();dirty=true;save();refreshInfo();});
document.querySelector('.x-spreadsheet-bottombar').addEventListener('click',clearSelection);
grid.on('cell-selected',(cell,r,c)=>{selection={r,c};let n=c+1,label='';while(n){n--;label=String.fromCharCode(65+n%26)+label;n=Math.floor(n/26);}$('#address').textContent=label+(r+1);$('#cell-value').value=cell?.text??'';$('#cell-value').disabled=cell?.editable===false;$('#cell-hint').textContent=cell?.editable===false?'计算/结构单元格':'可直接编辑';});
function applyCell(){const i=selectedSheet(),{r,c}=mergedAnchor(grid.getData()[i],selection.r,selection.c);if(grid.cell(r,c,i)?.editable===false)return;grid.cellText(r,c,$('#cell-value').value,i).reRender();collect();dirty=true;save();refreshInfo();}
document.querySelectorAll('#cell-value').forEach(el=>{el.addEventListener('keydown',e=>e.stopPropagation());el.addEventListener('keyup',e=>e.stopPropagation());el.addEventListener('paste',e=>e.stopPropagation());el.addEventListener('copy',e=>e.stopPropagation());el.addEventListener('cut',e=>e.stopPropagation());});
$('#apply-cell').onclick=applyCell;$('#cell-value').addEventListener('keydown',e=>{if(e.key==='Enter'){applyCell();e.preventDefault();}});
function replan(){try{collect();const parsed=readSheets(sheets,project),next=parsed.project;next.weekends=$('#weekends').checked;const solved=schedule(next);writeResults(sheets,next,solved);project=next;dirty=false;load(sheets);save();localStorage.setItem(OLD,JSON.stringify({project,savedAt:new Date().toISOString()}));const messages=solved.issues.map(i=>i.message);$('#error').hidden=!messages.length;$('#error').textContent=messages.join('\n');$('#status').textContent=`已刷新 ${project.tasks.length} 个节点${solved.pending?' · '+solved.pending+' 项待定':''}`;return solved;}catch(e){dirty=true;save();$('#error').hidden=false;$('#error').textContent='未完成重排：'+e.message+'\n原始编辑内容已保留，请修改后重试。';refreshInfo();return null;}}
$('#replan').onclick=replan;$('#weekends').onchange=()=>{project.weekends=$('#weekends').checked;dirty=true;save();refreshInfo();};
function dialog(html,fn){$('#dialog-content').innerHTML=html;callback=fn;$('#confirm').textContent=fn?'确认':'知道了';$('#cancel').hidden=!fn;$('#dialog').showModal();}
$('#cancel').onclick=()=>$('#dialog').close();$('#confirm').onclick=()=>{const fn=callback;$('#dialog').close();fn?.();};
$('#help').onclick=()=>dialog('<h2>按原表直接编辑</h2><p>支持同行合并：活动标题合并后视为一个活动；周期、依赖、人力合并后按左上角内容共用。不同完成日的日期格不能合并，跨字段合并会提示修正。</p><p>每个领域依次保留：活动、固定周期、时间节点、人力、依赖；节点ID行默认隐藏，仅在后台维护。领域名称在活动行A列修改。黄色单元格可输入 10 days、1 week、1 Month；0 day为汇合里程碑，待定保持下游待定。</p><p>依赖行填写 $节点ID，多个用分号分隔，例如 $pcba;$sample。并行任务设置相同前置。共用日期填写 共用:$源节点ID，周期填“共用节点”。活动名可以修改，ID需唯一且已有引用须同步更新。</p><p>同一领域新增活动：在右侧空白列填写名称、周期、依赖；ID留空会自动生成。复制活动后请更换ID。保留“固定周期／依赖／节点ID”等结构行名称；日期行为计算结果。</p><p>在“停工日历”页填写开始、结束日期（YYYY-MM-DD），含首尾。Month从实际开始日加日历月再减1天，月末截断；停工顺延。与旧Excel固定30天口径不同。</p><p>双击单元格编辑，按 Enter 确认。工具栏支持撤销/重做、格式、合并、冻结；重排后会更新计算日期和主导前置格式。保存备份可保留表格布局、格式、人力和未完成修改。</p>');
$('#restore').onclick=()=>dialog('<h2>载入演示横向模板？</h2><p>恢复模块、单板、结构、测试四个领域的历史活动和依赖。当前表格先备份，可通过“恢复上次计划”找回。</p>',()=>{collect();try{localStorage.setItem(BACKUP,JSON.stringify({project,sheets,dirty}));}catch{dialog('<p>备份失败，请先“保存备份”，当前计划未替换。</p>');return;}project=structuredClone(history);dirty=false;load(toSheets(project));$('#weekends').checked=!!project.weekends;$('#error').hidden=true;$('#recover').hidden=false;save();});
$('#recover').hidden=!localStorage.getItem(BACKUP);$('#recover').onclick=()=>dialog('<h2>恢复切换前的计划？</h2><p>当前编辑可先保存备份。</p>',()=>{try{const d=JSON.parse(localStorage.getItem(BACKUP));project=d.project;dirty=!!d.dirty;load(d.sheets);$('#weekends').checked=!!project.weekends;save();}catch(e){dialog('<p>备份不可读取，请打开已下载的备份文件。</p>');}});
function download(content,name){const url=URL.createObjectURL(new Blob([content],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('#backup').onclick=()=>{collect();download(JSON.stringify({format:'planflow-online-sheet',project,sheets,dirty},null,2),(project.name||'计划')+'_在线表格.json');};
$('#open').onclick=()=>$('#file').click();$('#file').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>15e6)throw Error('文件超过15MB');let next;if(f.name.endsWith('.xlsx')){const buffer=await f.arrayBuffer(),native=await readOnlineWorkbook(buffer,window.ExcelJS);if(native){const p=readSheets(native,project).project;next={project:p,sheets:hideNodeRows(native),dirty:true};}else{const p=await importExcel(buffer,f.name);next={project:p,sheets:toSheets(p),dirty:false};}}else{const d=JSON.parse(await f.text());next=d.format==='planflow-online-sheet'?d:{project:d,sheets:toSheets(d),dirty:false};if(!Array.isArray(next.sheets)||!next.project?.tasks)throw Error('备份格式无效');}
 dialog('<h2>打开计划文件？</h2><p>将替换当前表格。当前内容会自动备份。</p>',()=>{collect();try{localStorage.setItem(BACKUP,JSON.stringify({project,sheets,dirty}));}catch{dialog('<p>备份失败，请先保存当前计划。</p>');return;}project=next.project;dirty=!!next.dirty;load(next.sheets);$('#weekends').checked=!!project.weekends;$('#recover').hidden=false;save();});
 }catch(err){$('#error').hidden=false;$('#error').textContent='打开失败：'+err.message;}finally{e.target.value='';}};
refreshInfo();save();

$('#export-xlsx').onclick=async()=>{
 const button=$('#export-xlsx');button.disabled=true;
 try{collect();hideNodeRows(sheets);const buffer=await workbookBuffer(sheets,window.ExcelJS);const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download=(text(sheets.find(s=>s.name==='原表排期'),0,0)||'项目计划')+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('#status').textContent=dirty?'已导出当前表格（含未重排的编辑，请按需一键重排）':'已导出 Excel · 保留当前布局与格式';}
 catch(e){$('#error').hidden=false;$('#error').textContent='Excel导出失败：'+e.message;}finally{button.disabled=false;}
};

$('#to-timeline').onclick=()=>{
 const solved=replan();if(!solved)return;
 try{
  const {timeline,pending,commonCount}=planToTimeline(project,solved);
  if(!timeline.events.length)throw Error('没有可转换的已排期活动，请先填写周期和依赖。');
  const fatal=solved.issues.filter(i=>i.severity==='error');if(fatal.length)throw Error(fatal.map(i=>i.message).join('；'));
  const pendingNote=pending.length?`<p>${pending.length} 项日期待定，暂不生成事件，名称将保留在时间轴项目说明中。</p>`:'';
  dialog(`<h2>转换到时间轴</h2><p>生成 ${timeline.groups.length} 个领域分组、${timeline.events.length} 个事件，其中 ${commonCount} 个共用关键节点位于分组外。</p>${pendingNote}<p>转换后打开新的时间轴。当前时间轴将保存为“排期转换前备份”，可从版本记录恢复。</p>`,async()=>{
   try{
    const current=localStorage.getItem('osa-timeline-v1');
    if(current){const old=JSON.parse(current),id=crypto.randomUUID?.()||'plan-'+Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');await writeVersionSnapshot(id,old);if(localStorage.getItem('osa-timeline-v1')!==current)throw Error('时间轴已在其他窗口变化，请重试转换。');timeline.revisions=[...(old.revisions||[]),{id,snapshotId:id,snapshotStatus:'ready',kind:'tag',name:'排期转换前备份',time:new Date().toISOString(),summary:'从项目排期转换前的完整时间轴'}];}
    localStorage.setItem('osa-timeline-v1',JSON.stringify(timeline));localStorage.setItem('osa-timeline-v1:savedAt',new Date().toISOString());location.href='./timeline/index.html?from=plan';
   }catch(e){$('#error').hidden=false;$('#error').textContent='未转换：'+e.message;}
  });
 }catch(e){$('#error').hidden=false;$('#error').textContent='未转换：'+e.message;}
};
