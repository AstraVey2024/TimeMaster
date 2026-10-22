export function parsePeriod(value,format=''){
 const s=String(value??'').trim();
 if(/不涉及/.test(s))return {duration:0,unit:'day',status:'na'};
 if(!s||/待定|共用|公用/.test(s))return {duration:null,unit:'day',status:'auto'};
 const m=s.match(/^([0-9]+(?:\.[0-9]+)?)\s*(days?|weeks?|months?|天|周|月)?/i);
 if(!m||(!m[2]&&!format&&String(Number(s))!==s))throw Error('无法识别周期：'+s+'，请输入如 10 days、1 week、1 Month');
 const u=(m[2]||format||'day').toLowerCase();
 return {duration:Number(m[1]),unit:/month|月/.test(u)?'month':/week|周/.test(u)?'week':'day',status:'auto'};
}
const clean=s=>String(s??'').replace(/^\$/,'').replace(/\s+/g,'').trim();
export function resolveRefs(value,tasks,self){
 return [...new Set(String(value||'').split(/[;,；，\n]+/).map(x=>x.trim()).filter(Boolean).map(v=>{
  const key=v.replace(/^\$/,'');const exact=tasks.find(t=>t.id===key);if(exact)return exact.id;
  const matches=tasks.filter(t=>clean(t.name)===clean(v)&&!t.sharedWith&&t.id!==self);
  if(matches.length!==1)throw Error(`依赖「${v}」${matches.length?'不唯一，请使用节点ID':'不存在'}`);
  return matches[0].id;
 }))];
}
async function unzip(buffer){
 const v=new DataView(buffer),bytes=new Uint8Array(buffer),decoder=new TextDecoder(),out={};let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65558);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)throw Error('请使用未加密的 .xlsx 文件，不支持旧版 .xls');
 let p=v.getUint32(end+16,true),total=0;
 for(let i=0;i<v.getUint16(end+10,true);i++){
  if(v.getUint32(p,true)!==0x02014b50)throw Error('Excel压缩目录损坏');
  const method=v.getUint16(p+10,true),size=v.getUint32(p+20,true),expanded=v.getUint32(p+24,true),nl=v.getUint16(p+28,true),xl=v.getUint16(p+30,true),cl=v.getUint16(p+32,true),loc=v.getUint32(p+42,true),name=decoder.decode(bytes.slice(p+46,p+46+nl));p+=46+nl+xl+cl;
  total+=expanded;if(total>60000000)throw Error('解压内容过大，请精简Excel');
  if(!name.endsWith('.xml')&&!name.endsWith('.rels'))continue;
  const start=loc+30+v.getUint16(loc+26,true)+v.getUint16(loc+28,true),raw=bytes.slice(start,start+size);
  if(method!==0&&method!==8)throw Error('不支持此压缩格式');
  out[name]=method===0?decoder.decode(raw):await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
 }
 return out;
}
const xml=s=>{const d=new DOMParser().parseFromString(s||'<root/>','application/xml');if(d.querySelector('parsererror'))throw Error('Excel XML无法解析');return d;};
const all=(d,n)=>Array.from(d.getElementsByTagNameNS('*',n));
const serial=n=>new Date((Number(n)-25569)*86400000).toISOString().slice(0,10);
const date=v=>typeof v==='number'?serial(v):/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(v||'')?String(v).slice(0,10).split(/[-/]/).map((x,i)=>i?x.padStart(2,'0'):x).join('-'):'';
export async function importExcel(buffer,filename){
 const files=await unzip(buffer),wb=xml(files['xl/workbook.xml']),rels=all(xml(files['xl/_rels/workbook.xml.rels']),'Relationship'),strings=all(xml(files['xl/sharedStrings.xml']),'si').map(si=>all(si,'t').map(t=>t.textContent).join(''));
 const styles=xml(files['xl/styles.xml']),formats=new Map(all(styles,'numFmt').map(n=>[n.getAttribute('numFmtId'),n.getAttribute('formatCode')])),xfs=all(styles,'cellXfs')[0],fmt=xfs?all(xfs,'xf').map(x=>formats.get(x.getAttribute('numFmtId'))||''):[];
 const sheets={};
 for(const sh of all(wb,'sheet')){
  const rel=rels.find(r=>r.getAttribute('Id')===sh.getAttribute('r:id'));if(!rel)continue;
  const target=rel.getAttribute('Target'),path=target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'');const doc=xml(files[path]),cells={},rows=[];
  for(const c of all(doc,'c')){const ref=c.getAttribute('r'),type=c.getAttribute('t'),raw=all(c,'v')[0]?.textContent;let value=type==='s'?strings[Number(raw)]:type==='inlineStr'?all(c,'t').map(t=>t.textContent).join(''):type==='e'?'':raw===undefined?'':type==='str'?raw:Number(raw);cells[ref]={value,format:fmt[Number(c.getAttribute('s'))]||''};const r=Number(ref.match(/\d+/)[0])-1,col=ref.match(/[A-Z]+/)[0].split('').reduce((a,c)=>a*26+c.charCodeAt(0)-64,0)-1;(rows[r]??=[])[col]=value;}
  sheets[sh.getAttribute('name')]={cells,rows};
 }
 const project={schemaVersion:2,name:filename.replace(/\.xlsx$/i,''),start:'',monthMode:'calendar',monthDays:30,weekends:false,holidays:[],tasks:[]};
 const base=(id,lane,name)=>({id:String(id),lane:String(lane||'未分组'),name:String(name||''),deps:[],sharedWith:'',status:'auto',duration:null,unit:'day',fixedEnd:'',target:'',actualEnd:''});
 const config=sheets['排期配置'];
 if(config){
  const main=sheets[config.cells.B1?.value]||sheets['原表排期'];if(!main)throw Error('配置指定的源表不存在');project.start=date(main.cells[config.cells.B2?.value||'C3']?.value);
  for(const r of config.rows.slice(6)){if(!r?.[0])continue;const t=base(r[0],r[1],r[2]),cell=main.cells[r[4]];Object.assign(t,parsePeriod(typeof cell?.value==='number'||/^\s*\d/.test(String(cell?.value||''))?cell.value:r[5],cell?.format||r[6]));t.deps=String(r[7]||'').split(/[,，;；]+/).filter(Boolean);t.sharedWith=String(r[8]||'');t.status=r[9]||t.status;t.fixedEnd=date(r[10]);t.target=date(r[11]);project.tasks.push(t);}
  project.importNotes='已读取排期配置中的明确依赖；Month已改为日历月。';
 }else{
  const sheet=Object.values(sheets).find(s=>s.rows.some(r=>r?.includes('领域')&&(r.includes('活动')||r.includes('活动名称'))));
  if(sheet){const hi=sheet.rows.findIndex(r=>r?.includes('领域')),headers=sheet.rows[hi];const idx=(...names)=>headers.findIndex(x=>names.includes(String(x).trim()));
   for(const r of sheet.rows.slice(hi+1)){const name=r?.[idx('活动','活动名称')];if(!name)continue;const t=base(r[idx('ID')]||'n'+(project.tasks.length+1),r[idx('领域')],name);Object.assign(t,parsePeriod(r[idx('周期','必要周期','固定周期')],r[idx('单位')]));t._refs=String(r[idx('依赖','依赖关系','前置节点')]||'');project.tasks.push(t);}
  }else{
   const source=sheets['原表排期']||Object.values(sheets)[0];
   for(let i=1;i<source.rows.length;i++){const r=source.rows[i];if(!/固定周期|必要周期/.test(String(r?.[0]||'')))continue;const heads=source.rows[i-1];const deps=source.rows.slice(i+1,i+5).find(x=>/^依赖/.test(String(x?.[0]||'')));
    for(let c=2;c<heads.length;c++){if(!String(heads[c]||'').trim())continue;const t=base('n'+(project.tasks.length+1),heads[0],heads[c]);const col=(()=>{let n=c+1,s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;})();Object.assign(t,parsePeriod(r[c],source.cells[col+(i+1)]?.format));t._refs=deps?String(deps[c]||''):'';project.tasks.push(t);}
   }
   project.importNotes='横向表未写明的前置不按列顺序猜测，请在依赖列补充；留空表示从计划起始日独立开展。';
  }
  const groups=new Map();for(const t of project.tasks.filter(t=>t.name.startsWith('$'))){const k=clean(t.name);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(t);}
  for(const ts of groups.values()){const sources=ts.filter(t=>t.duration!==null);if(sources.length===1)for(const t of ts.filter(x=>x!==sources[0]))t.sharedWith=sources[0].id;else if(ts.length>1)throw Error(`共用节点「${ts[0].name}」需指定唯一有周期的源节点，其余填写共用节点`);}
  for(const t of project.tasks){if(!t.sharedWith)t.deps=resolveRefs(t._refs,project.tasks,t.id);delete t._refs;}
 }
 for(const sheet of Object.values(sheets))for(const row of sheet.rows){if(!row)continue;const i=row.findIndex(v=>String(v).trim()==='计划起始日期');if(i>=0&&!project.start)project.start=row.slice(i+1).map(date).find(Boolean)||'';}
 const holidays=sheets['停工日历'];if(holidays)for(const r of holidays.rows){const d=date(r?.[0]);if(d)project.holidays.push({name:'Excel停工日',start:d,end:d,id:d});}
 if(!project.start)throw Error('Excel中缺少计划起始日期，请添加“计划起始日期”及相邻日期单元格');
 if(!project.tasks.length)throw Error('未找到计划：请使用领域、活动、周期、依赖列，或领域横向表配固定周期行');
 return project;
}
