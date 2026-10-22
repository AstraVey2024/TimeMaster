import {styles as planStyles} from './sheet-model.mjs';
// Convert the visible spreadsheet model to styled native XLSX cells.
export async function workbookBuffer(sheets, ExcelJS) {
 const book=new ExcelJS.Workbook();book.creator='序程';book.created=new Date();
 const color=v=>({argb:'FF'+String(v||'#25334a').replace('#','').toUpperCase()});
 for(const source of sheets){
  const ws=book.addWorksheet(source.name,{properties:{defaultRowHeight:21.75},views:[{showGridLines:true}]});
  const cols=source.cols||{};
  for(let c=0;c<(cols.len||30);c++){const col=ws.getColumn(c+1);col.width=Math.max(1,((cols[c]?.width||170)-5)/7);col.hidden=!!cols[c]?.hide;}
  for(const [key,data]of Object.entries(source.rows||{})){
   if(!/^\d+$/.test(key))continue;
   const row=ws.getRow(Number(key)+1);row.height=(data.height||29)*.75;row.hidden=!!data.hide;
   for(const [ck,entry]of Object.entries(data.cells||{})){
    const cell=row.getCell(Number(ck)+1),s=source.styles?.[entry.style]||{},f=s.font||{};
    cell.value=entry.text??'';
    cell.font={name:f.name||'Arial',size:f.size||11,bold:!!f.bold,italic:!!f.italic,underline:!!s.underline,strike:!!s.strike,color:color(s.color)};
    cell.alignment={horizontal:s.align||'left',vertical:s.valign==='middle'?'middle':s.valign||'middle',wrapText:!!s.textwrap};
    if(s.bgcolor)cell.fill={type:'pattern',pattern:'solid',fgColor:color(s.bgcolor)};
    if(s.format==='percent')cell.numFmt='0.00%';
    if(s.border){cell.border={};for(const side of ['top','bottom','left','right'])if(s.border[side]){const [style,shade]=s.border[side];cell.border[side]={style:({thin:'thin',medium:'medium',thick:'thick',dashed:'dashed',dotted:'dotted',double:'double'})[style]||'thin',color:color(shade)};}}
   }
  }
  for(const range of source.merges||[])ws.mergeCells(range);
  const freeze=/^([A-Z]+)(\d+)$/.exec(source.freeze||'');
  if(freeze){let c=0;for(const ch of freeze[1])c=c*26+ch.charCodeAt(0)-64;ws.views=[{state:'frozen',xSplit:c-1,ySplit:Number(freeze[2])-1,showGridLines:true}];}
  ws.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0};
 }
 return book.xlsx.writeBuffer();
}

// Preserve native spreadsheet layout when reopening a workbook exported by this editor.
export async function readOnlineWorkbook(buffer,ExcelJS){
 const book=new ExcelJS.Workbook();await book.xlsx.load(buffer);
 const main=book.getWorksheet('原表排期');if(!main)return null;
 let hasDependencies=false,hasIds=false;main.eachRow(row=>{if(row.getCell(1).value==='依赖')hasDependencies=true;if(row.getCell(1).value==='节点ID')hasIds=true;});if(!hasDependencies||!hasIds)return null;
 const rgb=c=>c?.argb?'#'+c.argb.slice(-6):undefined,sheets=[];
 for(const ws of book.worksheets){
  const sheet={name:ws.name,rows:{len:Math.max(100,ws.rowCount)},cols:{len:Math.max(30,ws.columnCount)},styles:structuredClone(planStyles),merges:[...(ws.model.merges||[])]};
  for(let c=1;c<=ws.columnCount;c++){const col=ws.getColumn(c);sheet.cols[c-1]={width:Math.round((col.width||23.57)*7+5),hide:!!col.hidden};}
  ws.eachRow({includeEmpty:true},(row,r)=>{const out={cells:{},height:(row.height||21.75)/.75,hide:!!row.hidden};sheet.rows[r-1]=out;
   row.eachCell({includeEmpty:false},(cell,c)=>{if(cell.isMerged&&cell.master.address!==cell.address)return;
    let value=cell.value;if(value instanceof Date)value=value.toISOString().slice(0,10);else if(value&&typeof value==='object')value=value.result??value.richText?.map(p=>p.text).join('')??value.text??'';
    const f=cell.font||{},a=cell.alignment||{},style={font:{name:f.name||'Arial',size:f.size||11,bold:!!f.bold,italic:!!f.italic},color:rgb(f.color),bgcolor:rgb(cell.fill?.fgColor),align:a.horizontal||'left',valign:a.vertical||'middle',textwrap:!!a.wrapText,underline:!!f.underline,strike:!!f.strike,border:{}};
    for(const [side,b]of Object.entries(cell.border||{}))if(['top','bottom','left','right'].includes(side))style.border[side]=[b.style||'thin',rgb(b.color)||'#000000'];
    const idx=sheet.styles.push(style)-1;out.cells[c-1]={text:String(value??''),style:idx};
   });
  });
  for(const ref of sheet.merges){const [a,b]=ref.split(':'),first=ws.getCell(a),last=ws.getCell(b);sheet.rows[first.row-1].cells[first.col-1].merge=[last.row-first.row,last.col-first.col];}
  sheets.push(sheet);
 }
 if(!sheets.some(s=>s.name==='停工日历'))sheets.push({name:'停工日历',rows:{len:100,0:{cells:{0:{text:'名称'},1:{text:'开始日期'},2:{text:'结束日期'}}}},cols:{len:6},styles:[],merges:[]});
 return sheets;
}
