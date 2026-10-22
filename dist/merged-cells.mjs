export function cellAddress(r,c){let s='';for(c++;c;c=Math.floor((c-1)/26))s=String.fromCharCode(65+(c-1)%26)+s;return s+(r+1);}
export function mergedRanges(sheet){return (sheet.merges||[]).map(ref=>{const m=/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i.exec(ref);if(!m)throw Error('无效合并范围：'+ref);const col=s=>[...s.toUpperCase()].reduce((a,c)=>a*26+c.charCodeAt(0)-64,0)-1;return {r:Number(m[2])-1,c:col(m[1]),endR:Number(m[4])-1,endC:col(m[3]),ref};});}
export function mergedAnchor(sheet,r,c){const m=mergedRanges(sheet).find(m=>r>=m.r&&r<=m.endR&&c>=m.c&&c<=m.endC);return m||{r,c,endR:r,endC:c,ref:cellAddress(r,c)};}
export function mergedText(sheet,r,c){const a=mergedAnchor(sheet,r,c);return String(sheet.rows?.[a.r]?.cells?.[a.c]?.text??'').trim();}
