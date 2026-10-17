// Export geometry is independent of editor zoom and preview display size.
export function cropBounds(crop,width,height){
 const values=[crop.x,crop.y,crop.width,crop.height,width,height].map(Number);
 if(values.some(n=>!Number.isFinite(n))||width<=0||height<=0)throw Error('裁剪区域数值无效');
 const [x,y,w,h]=values;if(x<0||y<0||w<1||h<1||x+w>width+.01||y+h>height+.01)throw Error('裁剪区域必须在图像边界内，且宽高至少为 1');
 return {x,y,width:w,height:h};
}
export function outputPixels(crop,width){const w=Math.round(Number(width)),h=Math.round(w*crop.height/crop.width);if(!Number.isFinite(w)||w<1||h<1||w>16384||h>16384||w*h>32000000)throw Error('输出尺寸过大：单边最多 16384 像素，总计最多 3200 万像素');return {width:w,height:h};}
export function dragCrop(start,end,width,height){const clamp=(n,max)=>Math.max(0,Math.min(max,n));const x1=clamp(start.x,width),y1=clamp(start.y,height),x2=clamp(end.x,width),y2=clamp(end.y,height);const x=Math.min(width-1,Math.round(Math.min(x1,x2))),y=Math.min(height-1,Math.round(Math.min(y1,y2)));return {x,y,width:Math.min(width-x,Math.max(1,Math.round(Math.abs(x1-x2)))),height:Math.min(height-y,Math.max(1,Math.round(Math.abs(y1-y2))))};}
export function projectFingerprint(state){const copy=structuredClone(state);delete copy.versionSnapshots;for(const r of copy.revisions||[])delete r.snapshotStatus;return JSON.stringify(copy);}
export function blankProject(title='未命名项目'){return {title:title.trim()||'未命名项目',projectInfo:{owner:'',description:'',version:''},groups:[],events:[],floatingLabels:[],revisions:[]};}
export async function writeProjectFile(handle,text){let writable;try{writable=await handle.createWritable();await writable.write(text);await writable.close();}catch(error){try{await writable?.abort();}catch{}throw error;}}
export function croppedSvg(markup,crop,size){return markup.replace(/<svg\b([^>]*)>/,(_,attrs)=>{const clean=attrs.replace(/\s(?:width|height|viewBox)="[^"]*"/g,'');return `<svg${clean} width="${size.width}" height="${size.height}" viewBox="${crop.x} ${crop.y} ${crop.width} ${crop.height}">`;});}
export function paintExport(canvas,image,size,transparent){canvas.width=size.width;canvas.height=size.height;const ctx=canvas.getContext('2d');if(!ctx)throw Error('浏览器无法创建图像');if(!transparent){ctx.fillStyle='#ffffff';ctx.fillRect(0,0,size.width,size.height);}ctx.drawImage(image,0,0,size.width,size.height);}
