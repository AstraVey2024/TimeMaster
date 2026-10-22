const DAY = 86400000;
export const iso = d => new Date(d * DAY).toISOString().slice(0, 10);
export function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`日期格式应为 YYYY-MM-DD：${value || '空白'}`);
  const d = Date.parse(`${value}T00:00:00Z`) / DAY;
  if (!Number.isFinite(d) || iso(d) !== value) throw new Error(`无效日期：${value}`);
  return d;
}
export function makeCalendar(project) {
  const holidays = new Set();
  for (const h of project.holidays || []) {
    const a = day(h.start), b = day(h.end || h.start);
    if (b < a || b - a > 3660) throw new Error(`停工日期范围无效：${h.name || h.start}`);
    for (let d = a; d <= b; d++) holidays.add(d);
  }
  const isOff = d => holidays.has(d) || (project.weekends && [0, 6].includes(new Date(d * DAY).getUTCDay()));
  const next = d => { for (let n = 0; n < 40000; n++, d++) if (!isOff(d)) return d; throw new Error('没有找到可用日期，请检查停工日历。'); };
  const end = (start, count) => { let d = next(start); for (let n = 1; n < Math.max(1, count); n++) d = next(d + 1); return d; };
  return {holidays, isOff, next, end};
}
export function calendarMonthDays(start, amount) {
  const d = new Date(start * DAY), whole = Math.floor(amount);
  const targetMonth = d.getUTCMonth() + whole;
  const last = new Date(Date.UTC(d.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
  const target = Date.UTC(d.getUTCFullYear(), targetMonth, Math.min(d.getUTCDate(), last)) / DAY;
  const fractionDays = new Date(target * DAY);
  const length = new Date(Date.UTC(fractionDays.getUTCFullYear(), fractionDays.getUTCMonth()+1, 0)).getUTCDate();
  return target - start + Math.ceil((amount-whole)*length);
}
export function schedule(project) {
  const anchor = day(project.start), month = Number(project.monthDays ?? 30);
  if (!Number.isFinite(month) || month <= 0 || month > 366) throw new Error('每月换算天数应在1至366之间。');
  if (!Array.isArray(project.tasks) || project.tasks.length > 2000) throw new Error('计划应包含节点数组，最多2000个节点。');
  const calendar = makeCalendar(project), map = new Map(), state = new Map(), results = Object.create(null), order = [], issues = [];
  for (const t of project.tasks) {
    if (!t.id || map.has(t.id)) throw new Error(`节点ID为空或重复：${t.id || '空白'}`);
    if (!t.name?.trim()) throw new Error(`节点 ${t.id} 缺少名称。`);
    if (!Array.isArray(t.deps)) throw new Error(`${t.name} 的前置节点必须为数组。`);
    map.set(t.id, t);
  }
  const label = id => map.get(id)?.name || id;
  function visit(id, path = []) {
    if (!map.has(id)) throw new Error(`引用了不存在的节点：${id}`);
    if (state.get(id) === 1) throw new Error(`发现循环依赖：${[...path, id].map(label).join(' → ')}`);
    if (state.get(id) === 2) return results[id];
    state.set(id, 1);
    const t = map.get(id), nextPath = [...path, id];
    if (!['auto', 'completed', 'na'].includes(t.status || 'auto')) throw new Error(`${t.name} 的状态无效。`);
    if (t.target) day(t.target);
    let r;
    if (t.sharedWith) {
      if (t.deps.length) throw new Error(`${t.name} 为共用节点，不能重复设置前置关系。`);
      const base = visit(t.sharedWith, nextPath);
      if (t.fixedEnd && (!base.end || t.fixedEnd !== iso(base.end))) issues.push({severity:'error', id, message:`${t.name} 的锁定日期与共用源节点冲突。`});
      r = {...base, id, sharedWith: t.sharedWith, canonical: base.canonical || t.sharedWith};
    } else if (['completed', 'na'].includes(t.status)) {
      const actual = t.actualEnd ? day(t.actualEnd) : null;
      r = {id, state:t.status, start:null, end:actual, available:actual ?? anchor - 1, days:0, drivers:[], delay:0};
    } else {
      const pre = [...new Set(t.deps)].map(dep => visit(dep, nextPath));
      const missing = t.duration === null || t.duration === '' || t.duration === undefined;
      const amount = Number(t.duration), factor = {day:1, week:7, month}[t.unit];
      if (!['day','week','month'].includes(t.unit)) throw new Error(`${t.name} 的周期单位无效。`);
      if (!missing && (!Number.isFinite(amount) || amount < 0 || Math.ceil(amount * factor) > 40000)) throw new Error(`${t.name} 的周期应为非负数，且净工期不超过40000天。`);
      let days = missing ? null : Math.ceil(amount * factor);
      const unknown = pre.some(p => p.available === null);
      const latest = pre.length && !unknown ? Math.max(...pre.map(p => p.available)) : null;
      const drivers = latest === null ? [] : [...new Set(t.deps)].filter(dep => results[dep].available === latest);
      const ready = Math.max(anchor, ...pre.filter(p => p.available !== null).map(p => p.available + (days === 0 ? 0 : 1)));
      if (!missing && t.unit === 'month' && project.monthMode !== 'fixed') days = calendarMonthDays(calendar.next(ready), amount);
      if (t.fixedEnd) {
        const fixed = day(t.fixedEnd), first = calendar.next(ready);
        if (unknown) issues.push({severity:'error', id, message:`${t.name} 已锁定日期，但必要前置仍待定。`});
        if (calendar.isOff(fixed)) issues.push({severity:'error', id, message:`${t.name} 的锁定日期落在停工日。`});
        if (fixed < first || (days !== null && fixed < calendar.end(first, days))) issues.push({severity:'error', id, message:`${t.name} 的锁定日期早于必要前置及完整净工期所允许的日期。`});
        r = {id, state:'fixed', start:unknown || fixed < first ? null : first, end:fixed, available:fixed, days, drivers, delay:0};
      } else if (missing || unknown) {
        r = {id, state:'pending', start:null, end:null, available:null, days, drivers:[], delay:0};
      } else {
        const first = calendar.next(ready), end = calendar.end(first, days);
        r = {id, state:'scheduled', start:first, end, available:end, days, drivers, delay:Math.max(0, end - ready + 1 - Math.max(1, days))};
      }
    }
    if (t.target && r.end !== null && !t.sharedWith) {
      r.targetGap = r.end - day(t.target);
      if (r.targetGap > 0) issues.push({severity:'warning', id, message:`${t.name} 测算比目标晚 ${r.targetGap} 天（${iso(r.end)}）。`});
    }
    results[id] = r; state.set(id, 2); order.push(id); return r;
  }
  for (const id of map.keys()) visit(id);
  const known = Object.values(results).filter(r => r.end !== null);
  const lastEnd = known.length ? Math.max(...known.map(r => r.end)) : null;
  const critical = new Set();
  const trace = id => { if (critical.has(id)) return; critical.add(id); const r=results[id]; if (r.sharedWith) trace(r.sharedWith); else for (const dep of r.drivers) trace(dep); };
  for (const r of known.filter(r => r.end === lastEnd)) trace(r.id);
  return {results, order, issues, critical:[...critical], lastEnd, holidayCount:calendar.holidays.size, pending:Object.values(results).filter(r => r.state === 'pending').length};
}

export function toCSV(project, solved) {
  const esc = value => { let s = String(value ?? ''); if (/^[=+@\-\t\r]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"','""')}"`; };
  const names = new Map(project.tasks.map(t=>[t.id,t.name]));
  const rows = [['ID','领域','活动','周期','单位','前置节点','共用源节点','开始日期','完成日期','主导依赖','目标日期','目标差距天','状态']];
  for(const t of project.tasks) {const r=solved.results[t.id]; rows.push([t.id,t.lane,t.name,t.duration,t.unit,t.deps.map(id=>names.get(id)).join('；'),names.get(t.sharedWith)||'',r.start!==null?iso(r.start):'',r.end!==null?iso(r.end):'',r.drivers.map(id=>names.get(id)).join('；'),t.target,r.targetGap??'',r.state]);}
  return '\uFEFF'+rows.map(row=>row.map(esc).join(',')).join('\r\n');
}
