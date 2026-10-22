import {mergedAnchor,mergedText,mergedRanges} from './merged-cells.mjs';
import {parsePeriod,resolveRefs} from './excel.mjs';
import {schedule,day,iso} from './engine.mjs';
export const text=mergedText;
const rawText=(sheet,r,c)=>String(sheet.rows?.[r]?.cells?.[c]?.text??'').trim();
export const styles=[
 {font:{name:'Arial',size:11},align:'center',valign:'middle',textwrap:true,color:'#25334a'},
 {bgcolor:'#dfe7f5',font:{bold:true,size:11},align:'center',valign:'middle',textwrap:true},
 {bgcolor:'#fff6df',color:'#254b82',textwrap:true},
 {bgcolor:'#edf5f3',color:'#254d46',align:'center'},
 {bgcolor:'#e5e7eb'},
 {font:{bold:true,size:16},color:'#243857'},
 {color:'#c52c49',font:{bold:true,size:11},textwrap:true,bgcolor:'#dfe7f5'},
 {color:'#6f7785',font:{size:10},textwrap:true},
 {bgcolor:'#eaf0fc',textwrap:true,color:'#34547c'}
];
export function put(s,r,c,value,style=0,editable=true){s.rows[r]??={cells:{}};s.rows[r].cells??={};s.rows[r].cells[c]={...s.rows[r].cells[c],text:String(value??''),style,editable};}
const orders={
 '模块':['spec','optical','schematic','size','module_pcb','dummy','sample','reliability_sample','reliability_test','code'],
 '单板':['board_design','board_size','layout','interconnect','material','cad','qc','eq','pcb','pcba','board_sample','kit','online','bom_archive','tr4a','board_mass_material','small_batch','tr5','ess','tr6'],
 '结构':['struct_size','struct_design','struct_sample','struct_kit','assembly','struct_test','struct_tr4a','archive','mass_material','fai','struct_tr5','struct_tr6'],
 '测试':['test_online','group1','basic_test','equipment_fit','dip_emc','test_tr4a','group2','qualification','long_reliability','board_fit','system_test','test_tr5']
};
export function historicalProject(sample){
 const p=structuredClone(sample);p.name='演示跨领域计划';p.monthMode='calendar';
 const extra=[['basic_test','基本功能测试（沿用结论）','group1'],['equipment_fit','装备FIT（沿用结论）','group1'],['qualification','鉴定实验','group2'],['long_reliability','中长期可靠性测试','group2'],['board_fit','单板FIT','group2'],['system_test','系统测试&强化测试','group2']];
 p.tasks.find(t=>t.id==='group1').name='UT测试（沿用结论）';p.tasks.find(t=>t.id==='group2').name='专业测试';
 for(const [id,name,source] of extra)p.tasks.push({id,name,lane:'测试',duration:null,unit:'day',deps:[],sharedWith:source,status:'auto',target:'',fixedEnd:'',actualEnd:''});
 return p;
}
export function toSheets(project){
 const main={name:'原表排期',freeze:'C7',styles:structuredClone(styles),rows:{len:100},cols:{len:30,0:{width:150},1:{width:100}},merges:['A1:V1','E3:V3']};
 for(let c=2;c<30;c++)main.cols[c]={width:170};
 put(main,0,0,project.name,5);main.rows[0].height=38;main.rows[0].cells[0].merge=[0,21];
 put(main,2,0,'计划起始日期',1,false);put(main,2,2,project.start,2);put(main,2,4,'Month按日历月；目标与测算分别保留。日期由“一键重排”更新。',7,false);main.rows[2].cells[4].merge=[0,17];
 let row=6;
 for(const lane of [...new Set(project.tasks.map(t=>t.lane))]){
  let tasks=project.tasks.filter(t=>t.lane===lane);const order=orders[lane]||[];tasks.sort((a,b)=>(order.includes(a.id)?order.indexOf(a.id):999)-(order.includes(b.id)?order.indexOf(b.id):999));
  for(let c=0;c<Math.max(22,tasks.length+2);c++)put(main,row-1,c,'',4,false);
  put(main,row,0,lane,1);put(main,row,1,'关键事务',1,false);main.rows[row].height=54;
  ['固定周期','时间节点（测算）','人力','依赖','节点ID'].forEach((v,i)=>put(main,row+i+1,0,v,1,false));main.rows[row+4].height=48;
  tasks.forEach((t,i)=>{const c=i+2;put(main,row,c,t.name,1);put(main,row+1,c,t.sharedWith?'共用节点':t.status==='na'?'不涉及':t.duration===null?'待定':`${t.duration} ${t.unit}`,2);put(main,row+2,c,'待重排',3,false);put(main,row+3,c,t.staff||'',2);put(main,row+4,c,t.sharedWith?'共用:$'+t.sharedWith:t.deps.map(id=>'$'+id).join(';'),8);put(main,row+5,c,t.id,7);});
  row+=7;
 }
 const holiday={name:'停工日历',styles:structuredClone(styles),rows:{len:100},cols:{len:6,0:{width:200},1:{width:170},2:{width:170}},merges:[]};
 ['名称','开始日期','结束日期'].forEach((v,c)=>put(holiday,0,c,v,1,false));
 for(const [i,h] of project.holidays.entries()){put(holiday,i+1,0,h.name,2);put(holiday,i+1,1,h.start,2);put(holiday,i+1,2,h.end||h.start,2);}
 const sheets=[main,holiday];writeResults(sheets,project,schedule(project));return sheets;
}
function blocks(sheet){
 const b=[];for(const [key,row]of Object.entries(sheet.rows||{})){const r=Number(key);if(!Number.isInteger(r)||rawText(sheet,r,0)!=='固定周期')continue;
  if(text(sheet,r+3,0)!=='依赖'||text(sheet,r+4,0)!=='节点ID')throw Error(`第${r+1}行所在领域需要保留“依赖”和“节点ID”行，请撤销行删除或恢复模板。`);
  b.push({head:r-1,period:r,date:r+1,staff:r+2,deps:r+3,id:r+4});
 }return b.sort((a,b)=>a.head-b.head);
}
export function readSheets(sheets,previous){
 const main=sheets.find(s=>s.name==='原表排期'),hol=sheets.find(s=>s.name==='停工日历');
 if(!main||!hol)throw Error('请保留“原表排期”和“停工日历”工作表名称。');
 const p={...previous,name:text(main,0,0)||'跨领域项目计划',start:text(main,2,2),monthMode:'calendar',tasks:[],holidays:[]};day(p.start);
 const prior=new Map(previous.tasks.map(t=>[t.id,t])),positions=new Map(),redirects=new Map();
 for(const b of blocks(main)){
  for(const m of mergedRanges(main))if(m.endC>=2&&m.r<=b.id&&m.endR>=b.head&&m.endR>m.r)throw Error(`合并范围 ${m.ref} 跨越活动、周期或依赖等不同字段，请改为同行合并。`);
  const lane=text(main,b.head,0);if(!lane)throw Error(`第${b.head+1}行缺少领域名称。`);
  const cols=Object.keys(main.rows[b.head]?.cells||{}).map(Number).filter(c=>c>=2).sort((a,b)=>a-b);
  for(const c of cols){const a=mergedAnchor(main,b.head,c);if(a.c!==c)continue;const name=text(main,b.head,c);if(!name)continue;
   let id=text(main,b.id,c);if(!id){id=`node_${b.head}_${c}`;put(main,b.id,c,id,7);}
   for(let covered=c+1;covered<=a.endC;covered++){const old=rawText(main,b.id,covered);if(old)redirects.set(old,id);}
   if(positions.has(id))throw Error(`节点ID重复：${id}。复制活动后请修改ID。`);
   const v=text(main,b.period,c),t={fixedEnd:'',target:'',actualEnd:'',...prior.get(id),id,name,lane,...parsePeriod(v),staff:text(main,b.staff,c),deps:[],sharedWith:'',_refs:text(main,b.deps,c),_alias:/共用|公用/.test(v)};
   if(prior.get(id)?.status==='completed')t.status='completed';
   p.tasks.push(t);positions.set(id,{...b,c});
  }
 }
 for(const t of p.tasks)t._refs=t._refs.replace(/\$([^;；,，\s]+)/g,(whole,id)=>'$'+(redirects.get(id)||id));
 if(!p.tasks.length)throw Error('没有活动：请在领域标题行的C列起填写活动名称及周期。');
 for(const t of p.tasks){if(/^共用[:：]/.test(t._refs)){const v=t._refs.slice(3);const refs=resolveRefs(v,p.tasks,t.id);if(refs.length!==1)throw Error(`${t.name}只能引用一个共用源节点`);t.sharedWith=refs[0];}else if(t._alias){const sources=p.tasks.filter(x=>x.id!==t.id&&x.name===t.name&&!x._alias&&!/^共用[:：]/.test(x._refs));if(sources.length!==1)throw Error(`${t.name}请在依赖行填写“共用:$节点ID”`);t.sharedWith=sources[0].id;}}
 for(const t of p.tasks){if(!t.sharedWith)t.deps=resolveRefs(t._refs,p.tasks,t.id);delete t._refs;delete t._alias;}
 for(const [key,row]of Object.entries(hol.rows||{})){const r=Number(key);if(!Number.isInteger(r)||r===0)continue;const start=text(hol,r,1),end=text(hol,r,2);if(!start&&!end)continue;if(!start)throw Error(`停工日历第${r+1}行缺少开始日期。`);day(start);day(end||start);p.holidays.push({id:'h'+r,name:text(hol,r,0)||'停工',start,end:end||start});}
 return {project:p,positions};
}
export function writeResults(sheets,project,solved){
 const main=sheets.find(s=>s.name==='原表排期');const {positions}=readSheets(sheets,project);const drivers=new Set();
 for(const t of project.tasks.filter(t=>t.sharedWith||t.name.startsWith('$')))for(const id of solved.results[t.id].drivers)drivers.add(id);
 const dateWrites=new Map();
 for(const t of project.tasks){const pos=positions.get(t.id);if(!pos)continue;const r=solved.results[t.id],a=mergedAnchor(main,pos.date,pos.c),value=r.end===null?r.state==='na'?'不涉及':'待定':iso(r.end),key=a.r+':'+a.c;
  if(dateWrites.has(key)&&dateWrites.get(key).value!==value)throw Error(`合并日期 ${a.ref} 对应多个不同完成日，请取消该日期合并后重排。`);dateWrites.set(key,{...a,value});
 }
 for(const pos of positions.values()){const a=mergedAnchor(main,pos.head,pos.c);for(let c=pos.c+1;c<=a.endC;c++){const d=mergedAnchor(main,pos.date,c);if(!dateWrites.has(d.r+':'+d.c))put(main,d.r,d.c,'',3,false);}}
 for(const a of dateWrites.values())put(main,a.r,a.c,a.value,3,false);
 for(const t of project.tasks){const pos=positions.get(t.id);if(pos)main.rows[pos.head].cells[pos.c].style=drivers.has(t.id)?6:1;}
 const r=solved.results.tr4a,t=project.tasks.find(t=>t.id==='tr4a');put(main,2,4,r&&r.end!==null?`TR4A目标：${t.target||'未设'}；测算：${iso(r.end)}。红色粗体为共用节点的最晚前置。`:'红色粗体为共用节点的最晚前置；待定周期的必要下游保持待定。',7,false);main.rows[2].cells[4].merge=[0,17];
 return sheets;
}

export function hideNodeRows(sheets){for(const s of sheets)for(const [r,row] of Object.entries(s.rows||{}))if(row?.cells?.[0]?.text==="节点ID")row.hide=true;return sheets;}
