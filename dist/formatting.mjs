export const FONTS={system:{label:'系统默认',family:'-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif'},yahei:{label:'微软雅黑',family:'"Microsoft YaHei", "PingFang SC", sans-serif'},simsun:{label:'宋体',family:'SimSun, "Songti SC", serif'},simhei:{label:'黑体',family:'SimHei, "Heiti SC", sans-serif'},kaiti:{label:'楷体',family:'KaiTi, STKaiti, serif'},fangsong:{label:'仿宋',family:'FangSong, STFangsong, serif'},arial:{label:'Arial',family:'Arial, sans-serif'},times:{label:'Times New Roman',family:'"Times New Roman", serif'},georgia:{label:'Georgia',family:'Georgia, serif'},courier:{label:'Courier New',family:'"Courier New", monospace'}};
export const COLORS=['#ffffff','#000000','#e7e6e6','#44546a','#5b9bd5','#ed7d31','#a5a5a5','#ffc000','#4472c4','#70ad47','#f2f2f2','#7f7f7f','#d9e2f3','#8497b0','#bdd7ee','#f8cbad','#dbdbdb','#ffe699','#b4c6e7','#c6e0b4'];
export const TEXT_FIELDS=['title','date','description','metadata','tags','link','progress'];
export const GROUP_FIELDS=['name','range','summary'];
export const LAYOUT_PRESETS={compact:{rowGap:0,blockGap:2,padding:2,axisGap:12},standard:{rowGap:2,blockGap:7,padding:6,axisGap:20},loose:{rowGap:12,blockGap:22,padding:16,axisGap:40}};
const color=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)?v:'';
const bound=(v,min,max,fallback)=>Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;
export function normalizeLayout(v={}){if(!v||typeof v!=='object')v={};return {rowGap:bound(v.rowGap,0,40,2),blockGap:bound(v.blockGap,0,60,7),padding:bound(v.padding,0,30,6),axisGap:bound(v.axisGap,8,120,20)};}
export function normalizeTextStyle(v={}){if(!v||typeof v!=='object')v={};return {font:Object.hasOwn(FONTS,v.font)?v.font:'system',size:Number.isFinite(v.size)?bound(v.size,8,48,12):null,bold:v.bold===true,italic:v.italic===true,underline:v.underline===true,color:color(v.color)};}
export function textStyle(item,field,size=12){const s=normalizeTextStyle(item.textStyles?.[field]);return {...s,size:s.size??size,family:FONTS[s.font].family};}
export function textAttrs(item,field,size=12,scale=1,fallbackColor){const s=textStyle(item,field,size);return {'font-family':s.family,'font-size':s.size*scale,'font-weight':s.bold?'700':'400','font-style':s.italic?'italic':'normal','text-decoration':s.underline?'underline':'none',...(s.color||fallbackColor?{fill:s.color||fallbackColor}:{})};}
let context;
export function textWidth(text,style,scale=1){
  const font=style.size*scale;
  if(context===undefined){context=null;if(typeof document!=='undefined'){const canvas=document.createElement('canvas');if(typeof canvas.getContext==='function')context=canvas.getContext('2d');}}
  if(context){context.font=`${style.italic?'italic ':''}${style.bold?'700 ':''}${font}px ${style.family}`;return context.measureText(text).width;}
  return Array.from(text).reduce((n,c)=>n+(/[\u0000-\u00ff]/.test(c)?.57:1)*font,0)*(style.bold?1.08:1)*(style.italic?1.03:1);
}
export function groupMetrics(g,tracking=false){const name=textStyle(g,'name',10),range=textStyle(g,'range',10),summary=textStyle(g,'summary',10);const head=Math.max(22,name.size*1.5+6),rangeRow=Math.max(20,range.size*1.5+4),summaryRow=Math.max(20,summary.size*1.5+4);return {head,rangeRow,summaryRow,nameY:(head+name.size*.7)/2,rangeY:head+(rangeRow+range.size*.7)/2,summaryY:head+rangeRow+(summaryRow+summary.size*.7)/2,progressY:head+rangeRow+summaryRow+6,height:head+rangeRow+summaryRow+4+(tracking?22:0),minWidth:g.collapsed?Math.max(245,textWidth((g.icon?g.icon+' ':'')+g.name,name)+115):textWidth('▾ '+(g.icon?g.icon+' ':'')+g.name+(g.locked?' · 锁定':''),name)+44};}
export function normalizeFormatting(state){
  state.layout=normalizeLayout(state.layout);state.textStyles=state.textStyles&&typeof state.textStyles==='object'?state.textStyles:{};
  for(const item of [...state.events,...state.groups,state]){const styles=item.textStyles&&typeof item.textStyles==='object'?item.textStyles:{};item.textStyles={};for(const [key,value]of Object.entries(styles)){if([...TEXT_FIELDS,...GROUP_FIELDS,'projectTitle'].includes(key))item.textStyles[key]=normalizeTextStyle(value&&typeof value==='object'?value:{});}}
  for(const e of state.events){e.showProgress=e.showProgress===true;e.progress=bound(e.progress,0,100,0);e.progressColor=color(e.progressColor)||'#4472c4';}
  return state;
}
