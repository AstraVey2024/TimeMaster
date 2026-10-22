export const xml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function calendarDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;}
export function inspectImport(current,incoming){
 const errors=[],warnings=[],rows=[];if(!incoming||!Array.isArray(incoming.events)||!Array.isArray(incoming.groups))return {errors:['缺少节点或分组列表'],warnings,rows};
 if(incoming.floatingLabels!==undefined&&!Array.isArray(incoming.floatingLabels))return {errors:['悬浮标签列表无效'],warnings,rows};
 const seen=new Set(),signatures=new Set();
 for(const kind of ['groups','events','floatingLabels'])for(const item of incoming[kind]||[]){
  if(!item||typeof item.id!=='string'||!item.id){errors.push('存在无效或缺失 ID');continue;}
  if(seen.has(item.id))errors.push('重复 ID：'+item.id);seen.add(item.id);
  if(kind==='events'){
   if(!calendarDate(item.start)||item.end&&(!calendarDate(item.end)||item.end<item.start))errors.push('异常日期：'+(item.title||item.id));
   const sig=[item.title,item.start,item.end||''].join('|');if(current.events.some(e=>e.id!==item.id&&[e.title,e.start,e.end||''].join('|')===sig))warnings.push('与当前项目疑似重复：'+item.title);if(signatures.has(sig))warnings.push('疑似重复节点：'+item.title);signatures.add(sig);
   if(item.group&&!incoming.groups.some(g=>g?.id===item.group)&&!current.groups.some(g=>g.id===item.group))errors.push('未知分组：'+item.title);
  }
  const existing=(current[kind]||[]).find(e=>e.id===item.id);
  if(!existing&&['groups','events','floatingLabels'].some(k=>k!==kind&&(current[k]||[]).some(e=>e.id===item.id)))errors.push('跨类型 ID 冲突：'+item.id);
  rows.push({kind,id:item.id,title:item.title||item.name,action:existing?'覆盖':'新增'});
 }
 return {errors,warnings,rows};
}
export function mergeImport(current,incoming,mode='merge'){
 if(mode==='replace')return structuredClone(incoming);
 const next=structuredClone(current);for(const kind of ['groups','events','floatingLabels']){const m=new Map((next[kind]||[]).map(e=>[e.id,e]));for(const e of incoming[kind]||[])m.set(e.id,structuredClone(e));next[kind]=[...m.values()];}return next;
}
export function reportData(state,options={}){
 const events=state.events.filter(e=>(options.hidden||!e.hidden)&&(!options.start||(e.end||e.start)>=options.start)&&(!options.end||e.start<=options.end)&&(!options.groups||options.groups.includes(e.group||''))).map(e=>({...e,description:options.notes?e.description:'',image:'',imageThumb:''})).sort((a,b)=>a.start.localeCompare(b.start)||a.title.localeCompare(b.title,'zh-CN'));
 return {title:state.title,owner:state.projectInfo?.owner||'',version:state.projectInfo?.version||'',events,groups:state.groups,notes:!!options.notes,start:options.start||events[0]?.start||'',end:options.end||events.reduce((s,e)=>s>(e.end||e.start)?s:(e.end||e.start),'')};
}
const wrapReport=(s,n)=>String(s||'').split('\n').flatMap(line=>Array.from(line).reduce((a,c,i)=>(i%n?a[a.length-1]+=c:a.push(c),a),[]));
export function reportRows(data){return data.events.flatMap(e=>{const title=wrapReport(e.title,28),notes=data.notes?wrapReport(e.description,34):[];const count=Math.max(1,Math.ceil(title.length/2),Math.ceil(notes.length/3));return Array.from({length:count},(_,i)=>({...e,titleLines:title.slice(i*2,i*2+2),noteLines:notes.slice(i*3,i*3+3),continued:i>0}));});}
export function reportSvg(data,offset=0,limit=12,transparent=false){
 const all=reportRows(data),events=all.slice(offset,offset+limit),heading=wrapReport(data.title,50),extra=Math.max(0,heading.length-1)*34,width=1600,row=data.notes?144:88,height=190+extra+events.length*row;
 const start=Date.parse(data.start),span=Math.max(86400000,Date.parse(data.end)-start),x=s=>530+Math.max(0,Math.min(1,(Date.parse(s)-start)/span))*1010;
 const txt=(x,y,s,size=16,color='#272d36')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}">${xml(s)}</text>`;
 let body=`${transparent?'':'<rect width="100%" height="100%" fill="white"/>'}<rect width="12" height="100%" fill="#c7000b"/>${heading.map((s,i)=>txt(40,48+i*34,s,28)).join('')}${txt(40,80+extra,`负责人：${data.owner||'—'}  ·  版本：${data.version||'—'}  ·  ${data.start} — ${data.end}`,16,'#6b7280')}${txt(40,119+extra,`交付计划 · ${data.events.length} 个节点 · ${data.notes?'包含内部备注':'不含内部备注'} · 第 ${Math.floor(offset/limit)+1} / ${Math.ceil(all.length/limit)} 页`,14,'#6b7280')}`;
 for(let i=0;i<=4;i++){const xx=530+i*252.5;body+=`<path d="M${xx} ${160+extra}V${height-15}" stroke="#e2e5e9"/>`+txt(xx-15,149+extra,new Date(start+span*i/4).toISOString().slice(0,10),12);}
 events.forEach((e,i)=>{const y=175+extra+i*row,g=data.groups.find(g=>g.id===e.group);body+=`<rect x="28" y="${y-17}" width="490" height="${row-4}" rx="4" fill="${i%2?'#f4f5f7':'#fafafa'}"/>`;e.titleLines.forEach((s,j)=>body+=txt(40,y+j*20,(e.continued&&j===0?'（续）':'')+s,16));if(e.continued&&!e.titleLines.length)body+=txt(40,y,'（续）内部备注',14);body+=txt(40,y+44,`${e.start}${e.end?' → '+e.end:''}`,12,'#6b7280');body+=txt(40,y+61,g?.name||'未分组',12,'#6b7280');e.noteLines.forEach((s,j)=>body+=txt(40,y+81+j*17,s,12,'#6b7280'));const xx=x(e.start),xe=x(e.end||e.start);body+=e.end?`<rect x="${xx}" y="${y+5}" width="${Math.max(5,xe-xx)}" height="18" rx="5" fill="#c7000b"/>`:`<path d="M${xx} ${y}l9 14-9 14-9-14Z" fill="#c7000b"/>`;});
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Arial,Microsoft YaHei,sans-serif">${body}</svg>`;
}
const enc=new TextEncoder();
function zip(files){const parts=[],central=[];let pos=0;const le=(n,b)=>Array.from({length:b},(_,i)=>n>>>8*i&255);for(const [name,text]of Object.entries(files)){const filename=enc.encode(name),data=enc.encode(text);let crc=0xffffffff;for(const b of data){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;const local=new Uint8Array([80,75,3,4,20,0,0,0,0,0,0,0,33,0,...le(crc,4),...le(data.length,4),...le(data.length,4),...le(filename.length,2),0,0,...filename,...data]);central.push(new Uint8Array([80,75,1,2,20,0,20,0,0,0,0,0,0,0,33,0,...le(crc,4),...le(data.length,4),...le(data.length,4),...le(filename.length,2),0,0,0,0,0,0,0,0,0,0,0,0,...le(pos,4),...filename]));parts.push(local);pos+=local.length;}const len=central.reduce((n,a)=>n+a.length,0),end=new Uint8Array([80,75,5,6,0,0,0,0,...le(central.length,2),...le(central.length,2),...le(len,4),...le(pos,4),0,0]);return new Blob([...parts,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});}
export function excelReport(data){
 const rows=[['项目',data.title,'负责人',data.owner,'版本',data.version],['时间范围',data.start,data.end],['节点','类型','开始日期','结束日期','分组','负责人','状态','进度',...(data.notes?['内部备注']:[])],...data.events.map(e=>[e.title,e.end?'时间段':'里程碑',e.start,e.end||'',data.groups.find(g=>g.id===e.group)?.name||'未分组',e.owner||'',e.status||'',e.progress??0,...(data.notes?[e.description||'']:[])])];
 const sheet=`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="9" width="24" customWidth="1"/></cols><sheetData>${rows.map((r,i)=>`<row r="${i+1}">${r.map((v,j)=>`<c r="${String.fromCharCode(65+j)}${i+1}" t="inlineStr"><is><t xml:space="preserve">${xml(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'')}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
 return zip({'[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>','_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>','xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="交付汇报" sheetId="1" r:id="rId1"/></sheets></workbook>','xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>','xl/worksheets/sheet1.xml':sheet});
}
export function pdfReport(pages){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`];
 pages.forEach((p,i)=>{const id=3+i*3,scale=Math.min(802/p.width,555/p.height),w=p.width*scale,h=p.height*scale;const cmd=`q ${w} 0 0 ${h} 20 ${575-h} cm /Im0 Do Q`;objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /XObject << /Im0 ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`,[`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`,p.bytes,'\nendstream'],`<< /Length ${cmd.length} >>\nstream\n${cmd}\nendstream`);});
 const chunks=[enc.encode('%PDF-1.4\n')],offsets=[0];let size=chunks[0].length;objects.forEach((o,i)=>{offsets.push(size);for(const p of [`${i+1} 0 obj\n`,...(Array.isArray(o)?o:[o]),'\nendobj\n']){const b=typeof p==='string'?enc.encode(p):p;chunks.push(b);size+=b.length;}});chunks.push(enc.encode(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF`));return new Blob(chunks,{type:'application/pdf'});
}
