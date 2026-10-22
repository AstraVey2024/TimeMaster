import {iso} from './engine.mjs';
export function planToTimeline(project,solved){
 const byId=new Map(project.tasks.map(t=>[t.id,t]));
 function root(t){const seen=new Set();while(t.sharedWith){if(seen.has(t.id))throw Error('共用节点循环引用');seen.add(t.id);t=byId.get(t.sharedWith);if(!t)throw Error('共用源节点不存在');}return t;}
 const shared=new Set(project.tasks.filter(t=>t.name.startsWith('$')).map(t=>root(t).id));
 const lanes=[...new Set(project.tasks.map(t=>t.lane))],palette=['#5d7eaa','#628c56','#99628a','#c68e42','#528d91'];
 const groups=lanes.map((name,i)=>({id:'plan-group-'+i,name,side:i%2?1:-1,color:palette[i%palette.length],opacity:.15}));
 const laneGroup=new Map(groups.map(g=>[g.name,g]));const events=[],pending=[],seenShared=new Set();
 for(const t of project.tasks){const r=solved.results[t.id];if(r.state==='na')continue;if(r.end===null){pending.push({name:t.name,lane:t.lane});continue;}
  const base=root(t),common=shared.has(base.id);if(common&&seenShared.has(base.id))continue;if(common)seenShared.add(base.id);
  const source=common?base:t,result=common?solved.results[base.id]:r,g=laneGroup.get(source.lane),period=!common&&result.start!==null&&result.start<result.end;
  const related=project.tasks.filter(x=>root(x).id===base.id).map(x=>x.lane);const description=[`来源领域：${common?[...new Set(related)].join('、'):t.lane}`,`排期节点：${source.id}`,`周期：${source.duration??'待定'} ${source.unit}`,source.deps.length?'前置：'+source.deps.map(id=>byId.get(id)?.name||id).join('、'):''].filter(Boolean).join('\n');
  events.push({id:'plan-event-'+source.id,title:source.name.replace(/^\$/,''),start:iso(period?result.start:result.end),end:period?iso(result.end):'',group:common?'':g.id,side:common?-1:g.side,offset:common?80:75,color:common?'#c52c49':palette[lanes.indexOf(source.lane)%palette.length],textColor:'#ffffff',description,scale:1,align:'center',design:'label',tags:common?'共用关键节点':'',owner:source.staff||'',status:source.status==='completed'?'done':'pending',type:period?'period':'milestone',sourcePlanId:source.id});
 }
 const timeline={title:project.name+' · 时间轴',groups,events,floatingLabels:[],revisions:[],projectInfo:{description:'由项目排期转换；同领域同分组，共用关键节点独立显示。'+(pending.length?' 日期待定未生成：'+pending.map(t=>t.lane+'/'+t.name).join('、'):'')}};
 return {timeline,pending,commonCount:seenShared.size};
}
