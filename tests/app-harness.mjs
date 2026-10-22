// Lightweight DOM doubles for app wiring regression tests (not browser rendering).
import vm from 'node:vm';
import * as exportImage from '../dist/timeline/export-image.mjs';
import * as transfer from '../dist/timeline/transfer.mjs';
import * as versions from '../dist/timeline/versions.mjs';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import * as project from '../dist/timeline/project.mjs';
import * as presentation from '../dist/timeline/presentation.mjs';
import * as formatting from '../dist/timeline/formatting.mjs';
import * as dates from '../dist/timeline/dates.mjs';
import * as interactions from '../dist/timeline/interactions.mjs';
import * as content from '../dist/timeline/content.mjs';
import {layout} from '../dist/timeline/layout.mjs';
export function harness(options={}){
  const ids=new Map();let document;
  class El{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.attrs={};this.dataset={};this.children=[];this.style={};this.hidden=false;this.value='';this.checked=false;this.open=false;this.listeners={};this.clientWidth=1000;this.clientHeight=650;this.scrollTop=0;this.offsetWidth=240;this.offsetHeight=300;const classes=new Set();this.classList={add:(...v)=>v.forEach(x=>classes.add(x)),remove:(...v)=>v.forEach(x=>classes.delete(x)),toggle:(x,force)=>{const yes=force??!classes.has(x);yes?classes.add(x):classes.delete(x);},contains:x=>classes.has(x)};}
    setAttribute(k,v){this.attrs[k]=String(v);if(k==='id'){this.id=String(v);ids.set(this.id,this);}if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(v);if(k==='class')String(v).split(/\s+/).forEach(c=>this.classList.add(c));}
    append(...els){els.forEach(el=>{el.parent=this;this.children.push(el);});}
    replaceChildren(...els){for(const el of this.all()){if(el.id&&ids.get(el.id)===el)ids.delete(el.id);}this.children=[];this.append(...els);}
    all(){return this.children.flatMap(el=>[el,...el.all()]);}
    matches(s){if(s.startsWith('#'))return this.id===s.slice(1);if(s.startsWith('.'))return this.classList.contains(s.slice(1));const m=s.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);if(m)return this.attrs[m[1]]!==undefined&&(m[2]===undefined||this.attrs[m[1]]===m[2]);return this.tagName.toLowerCase()===s;}
    querySelector(s){return this.all().find(el=>el.matches(s))??null;}
    querySelectorAll(s){return this.all().filter(el=>el.matches(s));}
    closest(s){let el=this;while(el){if(el.matches(s))return el;el=el.parent;}return null;}
    contains(el){return el===this||this.all().includes(el);}
    set innerHTML(html){this.replaceChildren();this._html=html;const regex=/<([a-z][\w-]*)([^>]*)>/gi;let m;while((m=regex.exec(html))){const el=new El(m[1]);const attrs=m[2];for(const a of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)){el.setAttribute(a[1],a[2]??'');}el.value=el.attrs.value??'';el.checked=el.attrs.checked!==undefined;el.disabled=el.attrs.disabled!==undefined;if(el.tagName==='SELECT'){const end=html.indexOf('</select>',regex.lastIndex),inside=html.slice(regex.lastIndex,end),options=[...inside.matchAll(/<option([^>]*)>/g)];const selected=options.find(o=>/\bselected\b/.test(o[1]))??options[0];if(selected)el.value=selected[1].match(/value="([^"]*)"/)?.[1]??'';}this.append(el);}}
    get innerHTML(){return this._html||'';}
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(el=>el!==this); }
    select(){}
    focus(){document.activeElement=this;}click(){this.onclick?.({target:this});}
    showModal(){this.open=true;}close(){this.open=false;}
    insertAdjacentElement(where,el){const parent=this.parent;if(parent){el.parent=parent;parent.children.splice(parent.children.indexOf(this)+(where==='afterend'?1:0),0,el);}return el;}
    getBoundingClientRect(){return {left:20,top:300,right:250,bottom:330,width:230,height:30};}setPointerCapture(){}
  }
  const html=fs.readFileSync(new URL('../dist/timeline/index.html',import.meta.url),'utf8');
  const root=new El('body');root.innerHTML=html;
  const docListeners={};document={body:root,activeElement:root,querySelector:s=>s.includes(' ')?document.querySelector(s.split(' ')[0])?.querySelector(s.split(' ').slice(1).join(' '))??null:s==='dialog[open]'?[...ids.values()].find(el=>el.tagName==='DIALOG'&&el.open)??null:s.startsWith('#')?ids.get(s.slice(1))??null:root.querySelector(s),createElementNS:(_,tag)=>new El(tag),createElement:tag=>new El(tag),addEventListener:(k,fn)=>(docListeners[k]??=[]).push(fn)};
  // The initial parser deliberately flattens markup; populate menu children explicitly.
  for(const id of ['layoutDialog','formatDialog','reportDialog']){const el=ids.get(id),start=html.indexOf('<dialog id="'+id+'"'),end=html.indexOf('</dialog>',start);el.innerHTML=html.slice(html.indexOf('>',start)+1,end);}
  const menu=ids.get('contextMenu');menu.innerHTML=html.slice(html.indexOf('<div class="context-heading">'),html.indexOf('<div id="toast"'));
  const store=options.storage||new Map(),winListeners={},opened=[];
  const sandbox={...exportImage,...transfer,...versions,Option:class extends El{constructor(text,value){super('option');this.textContent=text;this.value=value;}},...formatting,...presentation,...project,...dates,...interactions,...content,layout,document,console,Date,Math,JSON,Object,Number,Array,Set,Map,String,URL,Blob,structuredClone,crypto:{randomUUID},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>{if(options.failSave?.(k,v))throw Error('quota');store.set(k,v);}},setTimeout:()=>1,clearTimeout:()=>{},ResizeObserver:class{observe(){}},window:{location:options.href?{href:options.href}:undefined,confirm:options.confirm||(()=>false),open:(url)=>{opened.push(url);return {};},innerWidth:1400,innerHeight:900,getSelection:()=>({removeAllRanges(){}}),addEventListener:(k,fn)=>(winListeners[k]??=[]).push(fn)}};
  const context=vm.createContext(sandbox);
  const source=fs.readFileSync(new URL('../dist/timeline/app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');vm.runInContext(source,context);
  return {storage:store,opened,run:code=>vm.runInContext(code,context),get:id=>ids.get(id),fire:(type,event)=>ids.get('canvas').listeners[type]?.forEach(fn=>fn({button:0,preventDefault(){},...event})),El,context};
}

