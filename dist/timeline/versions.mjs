// Version payloads live separately from the current document to avoid recursive
// histories and localStorage limits when projects contain images.
const memory=new Map();
let database;
async function db(){
 if(typeof indexedDB==='undefined')return null;
 if(!database)database=new Promise((resolve,reject)=>{const request=indexedDB.open('osa-timeline-history',1);request.onupgradeneeded=()=>request.result.createObjectStore('snapshots');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 return database;
}
export function snapshotDocument(state){const copy=structuredClone(state);delete copy.versionSnapshots;return copy;}
export async function writeVersionSnapshot(id,value){
 const data=snapshotDocument(value),database=await db();
 if(!database){if(typeof localStorage!=='undefined')localStorage.setItem('osa-version:'+id,JSON.stringify(data));else memory.set(id,data);return;}
 await new Promise((resolve,reject)=>{const tx=database.transaction('snapshots','readwrite');tx.objectStore('snapshots').put(data,id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Snapshot transaction aborted'));});
}
export async function readVersionSnapshot(id){
 const database=await db();
 if(!database){if(typeof localStorage!=='undefined'){const value=localStorage.getItem('osa-version:'+id);return value?JSON.parse(value):null;}return memory.has(id)?structuredClone(memory.get(id)):null;}
 return new Promise((resolve,reject)=>{const tx=database.transaction('snapshots','readonly'),request=tx.objectStore('snapshots').get(id);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);});
}
export function documentStorageKey(restoreId){return restoreId?'osa-timeline-draft:'+restoreId:'osa-timeline-v1';}
